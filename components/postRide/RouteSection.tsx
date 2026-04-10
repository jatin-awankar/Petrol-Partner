"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Eye, EyeOff } from "lucide-react";

import Icon from "@/components/AppIcon";
import type { PostRideFormData } from "@/lib/post-ride";
import {
  fetchDrivingRoute,
  geocodeSuggestions,
  hasMapboxToken,
  normalizeMapboxError,
  reverseGeocodeLocation,
  type MapboxSuggestion,
} from "@/lib/mapbox-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

interface RouteSectionProps {
  formData: PostRideFormData;
  updateFormData: React.Dispatch<React.SetStateAction<PostRideFormData>>;
  errors: Record<string, string>;
}

const INDIA_BOUNDS: [number, number, number, number] = [
  68.1766451354, 6.74713827189, 97.4025614766, 35.4940095078,
];

const RouteSection: React.FC<RouteSectionProps> = ({
  formData,
  updateFormData,
  errors,
}) => {
  const [showMap, setShowMap] = useState(false);
  const [pickupQuery, setPickupQuery] = useState(formData.route.pickup ?? "");
  const [dropoffQuery, setDropoffQuery] = useState(formData.route.dropoff ?? "");
  const [pickupSuggestions, setPickupSuggestions] = useState<MapboxSuggestion[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<MapboxSuggestion[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapPinTarget, setMapPinTarget] = useState<"pickup" | "dropoff">("pickup");

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const suppressPickupSearchRef = useRef(false);
  const suppressDropoffSearchRef = useRef(false);
  const pickupSearchAbortRef = useRef<AbortController | null>(null);
  const dropoffSearchAbortRef = useRef<AbortController | null>(null);

  const [selectedPickup, setSelectedPickup] = useState<{
    lat: number;
    lng: number;
  } | null>(
    formData.route.pickup_lat !== null && formData.route.pickup_lng !== null
      ? { lat: Number(formData.route.pickup_lat), lng: Number(formData.route.pickup_lng) }
      : null,
  );
  const [selectedDropoff, setSelectedDropoff] = useState<{
    lat: number;
    lng: number;
  } | null>(
    formData.route.drop_lat !== null && formData.route.drop_lng !== null
      ? { lat: Number(formData.route.drop_lat), lng: Number(formData.route.drop_lng) }
      : null,
  );

  useEffect(() => {
    if (!hasMapboxToken()) {
      setMapError("Map token missing. Add NEXT_PUBLIC_MAPBOX_TOKEN to use map features.");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationError(null);
      },
      () => {
        setLocationError("Location access denied. Suggestions may be less accurate.");
      },
      {
        enableHighAccuracy: true,
        timeout: 7000,
        maximumAge: 120000,
      },
    );
  }, []);

  useEffect(() => {
    setPickupQuery(formData.route.pickup ?? "");
    setDropoffQuery(formData.route.dropoff ?? "");
    setSelectedPickup(
      formData.route.pickup_lat !== null && formData.route.pickup_lng !== null
        ? { lat: Number(formData.route.pickup_lat), lng: Number(formData.route.pickup_lng) }
        : null,
    );
    setSelectedDropoff(
      formData.route.drop_lat !== null && formData.route.drop_lng !== null
        ? { lat: Number(formData.route.drop_lat), lng: Number(formData.route.drop_lng) }
        : null,
    );
  }, [
    formData.route.pickup,
    formData.route.dropoff,
    formData.route.pickup_lat,
    formData.route.pickup_lng,
    formData.route.drop_lat,
    formData.route.drop_lng,
  ]);

  useEffect(() => {
    if (!showMap || !mapContainerRef.current || mapRef.current || !hasMapboxToken()) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: userLocation ? [userLocation.lng, userLocation.lat] : [77.209, 28.6139],
      zoom: 5,
      maxBounds: [
        [INDIA_BOUNDS[0], INDIA_BOUNDS[1]],
        [INDIA_BOUNDS[2], INDIA_BOUNDS[3]],
      ],
    });

    mapRef.current = map;
    setMapError(null);

    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      const insideIndia =
        lng >= INDIA_BOUNDS[0] &&
        lng <= INDIA_BOUNDS[2] &&
        lat >= INDIA_BOUNDS[1] &&
        lat <= INDIA_BOUNDS[3];

      if (!insideIndia) return;
      void setRouteLocation(mapPinTarget, lng, lat);
    };

    map.on("click", handleMapClick);

    return () => {
      pickupMarkerRef.current?.remove();
      dropoffMarkerRef.current?.remove();
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [mapPinTarget, showMap, userLocation]);

  useEffect(() => {
    if (suppressPickupSearchRef.current) {
      suppressPickupSearchRef.current = false;
      return;
    }
    const timer = setTimeout(() => void searchLocation(pickupQuery, "pickup"), 350);
    return () => clearTimeout(timer);
  }, [pickupQuery]);

  useEffect(() => {
    if (suppressDropoffSearchRef.current) {
      suppressDropoffSearchRef.current = false;
      return;
    }
    const timer = setTimeout(() => void searchLocation(dropoffQuery, "dropoff"), 350);
    return () => clearTimeout(timer);
  }, [dropoffQuery]);

  useEffect(() => {
    if (!selectedPickup || !selectedDropoff) return;
    void fetchRoute();
  }, [selectedPickup, selectedDropoff]);

  const syncRouteData = (patch: Partial<PostRideFormData["route"]>) => {
    updateFormData((prev) => ({
      ...prev,
      route: {
        ...prev.route,
        ...patch,
      },
    }));
  };

  const addMarker = (type: "pickup" | "dropoff", lng: number, lat: number) => {
    if (!mapRef.current) return;

    const markerColor = type === "pickup" ? "#22c55e" : "#ef4444";
    const markerRef = type === "pickup" ? pickupMarkerRef : dropoffMarkerRef;
    markerRef.current?.remove();
    markerRef.current = new mapboxgl.Marker({ color: markerColor })
      .setLngLat([lng, lat])
      .addTo(mapRef.current);
  };

  const setRouteLocation = async (
    type: "pickup" | "dropoff",
    lng: number,
    lat: number,
  ) => {
    try {
      const place = await reverseGeocodeLocation({
        coords: { lng, lat },
        timeoutMs: 8000,
      });
      if (type === "pickup") {
        suppressPickupSearchRef.current = true;
        setPickupSuggestions([]);
        setPickupQuery(place);
        setSelectedPickup({ lat, lng });
        addMarker("pickup", lng, lat);
        syncRouteData({ pickup: place, pickup_lat: lat, pickup_lng: lng });
        return;
      }

      suppressDropoffSearchRef.current = true;
      setDropoffSuggestions([]);
      setDropoffQuery(place);
      setSelectedDropoff({ lat, lng });
      addMarker("dropoff", lng, lat);
      syncRouteData({ dropoff: place, drop_lat: lat, drop_lng: lng });
    } catch (error) {
      setMapError(normalizeMapboxError(error, "Failed to set route location."));
    }
  };

  const searchLocation = async (query: string, type: "pickup" | "dropoff") => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || !hasMapboxToken()) {
      if (type === "pickup") setPickupSuggestions([]);
      else setDropoffSuggestions([]);
      return;
    }
    if (
      (type === "pickup" &&
        selectedPickup &&
        normalizedQuery === (formData.route.pickup || "").trim()) ||
      (type === "dropoff" &&
        selectedDropoff &&
        normalizedQuery === (formData.route.dropoff || "").trim())
    ) {
      if (type === "pickup") setPickupSuggestions([]);
      else setDropoffSuggestions([]);
      return;
    }

    const controller = new AbortController();
    if (type === "pickup") {
      pickupSearchAbortRef.current?.abort();
      pickupSearchAbortRef.current = controller;
    } else {
      dropoffSearchAbortRef.current?.abort();
      dropoffSearchAbortRef.current = controller;
    }

    try {
      const suggestions = await geocodeSuggestions({
        query: normalizedQuery,
        proximity: userLocation ? { lng: userLocation.lng, lat: userLocation.lat } : null,
        country: "in",
        limit: 5,
        timeoutMs: 8000,
        signal: controller.signal,
      });
      if (type === "pickup") setPickupSuggestions(suggestions);
      else setDropoffSuggestions(suggestions);
      setMapError(null);
    } catch (error) {
      if ((error as { code?: string })?.code === "TIMEOUT") {
        setMapError("Location search timed out. Please try again.");
      }
    }
  };

  const useCurrentLocationAsPickup = async () => {
    if (!userLocation) {
      setLocationError("Current location is unavailable.");
      return;
    }
    await setRouteLocation("pickup", userLocation.lng, userLocation.lat);
  };

  const handleSelectSuggestion = async (
    type: "pickup" | "dropoff",
    suggestion: MapboxSuggestion,
  ) => {
    const [lng, lat] = suggestion.center;
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 13 });
    await setRouteLocation(type, lng, lat);
  };

  const fetchRoute = async () => {
    if (!selectedPickup || !selectedDropoff || !mapRef.current) return;
    if (!Number.isFinite(selectedPickup.lat) || !Number.isFinite(selectedPickup.lng)) return;
    if (!Number.isFinite(selectedDropoff.lat) || !Number.isFinite(selectedDropoff.lng)) return;

    try {
      const route = await fetchDrivingRoute({
        pickup: { lng: selectedPickup.lng, lat: selectedPickup.lat },
        dropoff: { lng: selectedDropoff.lng, lat: selectedDropoff.lat },
        timeoutMs: 10000,
      });

      if (mapRef.current.getLayer("route")) {
        mapRef.current.removeLayer("route");
      }
      if (mapRef.current.getSource("route")) {
        mapRef.current.removeSource("route");
      }

      mapRef.current.addSource("route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: route },
      });

      mapRef.current.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#2c7be5", "line-width": 5 },
      });
      setMapError(null);
    } catch (error) {
      setMapError(normalizeMapboxError(error, "Failed to draw route on map."));
    }
  };

  const routeReady =
    formData.route.pickup_lat !== null &&
    formData.route.pickup_lng !== null &&
    formData.route.drop_lat !== null &&
    formData.route.drop_lng !== null;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
            <Icon name="MapPin" size={18} className="text-primary" />
            Route details
          </h3>
          <Badge variant={routeReady ? "secondary" : "outline"}>
            {routeReady ? "Route locked" : "Route pending"}
          </Badge>
        </div>

        <div className="space-y-3 sm:space-y-4">
          <div className="space-y-2">
            <Label>Pickup</Label>
            <Input
              value={pickupQuery}
              onChange={(event) => {
                const value = event.target.value;
                setPickupQuery(value);
                if (value.trim() !== formData.route.pickup) {
                  setSelectedPickup(null);
                  syncRouteData({ pickup: value, pickup_lat: null, pickup_lng: null });
                }
              }}
              placeholder="Search pickup location"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => void useCurrentLocationAsPickup()}
              >
                Use current location
              </Button>
            </div>
            {pickupSuggestions.length > 0 && (
              <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-background/95 shadow-sm">
                {pickupSuggestions.map((suggestion, index) => (
                  <li
                    key={`${suggestion.place_name}-${index}`}
                    className="cursor-pointer px-3 py-2 text-sm transition-colors hover:bg-primary/10"
                    onClick={() => void handleSelectSuggestion("pickup", suggestion)}
                  >
                    {suggestion.place_name}
                  </li>
                ))}
              </ul>
            )}
            {errors.pickup ? <p className="mt-1 text-xs text-destructive">{errors.pickup}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>Dropoff</Label>
            <Input
              value={dropoffQuery}
              onChange={(event) => {
                const value = event.target.value;
                setDropoffQuery(value);
                if (value.trim() !== formData.route.dropoff) {
                  setSelectedDropoff(null);
                  syncRouteData({ dropoff: value, drop_lat: null, drop_lng: null });
                }
              }}
              placeholder="Search dropoff location"
            />
            {dropoffSuggestions.length > 0 && (
              <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-background/95 shadow-sm">
                {dropoffSuggestions.map((suggestion, index) => (
                  <li
                    key={`${suggestion.place_name}-${index}`}
                    className="cursor-pointer px-3 py-2 text-sm transition-colors hover:bg-primary/10"
                    onClick={() => void handleSelectSuggestion("dropoff", suggestion)}
                  >
                    {suggestion.place_name}
                  </li>
                ))}
              </ul>
            )}
            {errors.dropoff ? (
              <p className="mt-1 text-xs text-destructive">{errors.dropoff}</p>
            ) : null}
          </div>
        </div>

        {errors.routeCoordinates ? (
          <p className="mt-3 text-xs text-destructive">{errors.routeCoordinates}</p>
        ) : null}
        {locationError ? <p className="mt-1 text-xs text-muted-foreground">{locationError}</p> : null}
        {mapError ? <p className="mt-1 text-xs text-muted-foreground">{mapError}</p> : null}
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 md:p-5">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-foreground">Route map</p>
          <div className="flex gap-2">
            {showMap ? (
              <>
                <Button
                  variant={mapPinTarget === "pickup" ? "default" : "outline"}
                  size="sm"
                  type="button"
                  onClick={() => setMapPinTarget("pickup")}
                >
                  Pin Pickup
                </Button>
                <Button
                  variant={mapPinTarget === "dropoff" ? "default" : "outline"}
                  size="sm"
                  type="button"
                  onClick={() => setMapPinTarget("dropoff")}
                >
                  Pin Dropoff
                </Button>
              </>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setShowMap((prev) => !prev)}
            >
              {showMap ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showMap ? "Hide map" : "Show map"}
            </Button>
          </div>
        </div>
        {showMap ? (
          <div className="overflow-hidden rounded-lg border border-border/70">
            <p className="px-3 py-2 text-xs text-muted-foreground border-b border-border/70">
              Click map to set: {mapPinTarget === "pickup" ? "Pickup" : "Dropoff"}
            </p>
            <div ref={mapContainerRef} className="h-80 w-full" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open the map if you want to place points visually.
          </p>
        )}
      </div>
    </div>
  );
};

export default RouteSection;
