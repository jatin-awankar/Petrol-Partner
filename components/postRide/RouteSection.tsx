"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Eye, EyeOff } from "lucide-react";

import Icon from "@/components/AppIcon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface RouteSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
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
  const [pickupQuery, setPickupQuery] = useState(formData?.route?.pickup ?? "");
  const [dropoffQuery, setDropoffQuery] = useState(
    formData?.route?.dropoff ?? "",
  );
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<any[]>([]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const [selectedPickup, setSelectedPickup] = useState<{
    lat: number;
    lng: number;
  } | null>(
    formData?.route?.pickup_lat !== null && formData?.route?.pickup_lng !== null
      ? {
          lat: Number(formData.route.pickup_lat),
          lng: Number(formData.route.pickup_lng),
        }
      : null,
  );
  const [selectedDropoff, setSelectedDropoff] = useState<{
    lat: number;
    lng: number;
  } | null>(
    formData?.route?.drop_lat !== null && formData?.route?.drop_lng !== null
      ? {
          lat: Number(formData.route.drop_lat),
          lng: Number(formData.route.drop_lng),
        }
      : null,
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !showMap) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [77.209, 28.6139],
      zoom: 5,
      maxBounds: [
        [INDIA_BOUNDS[0], INDIA_BOUNDS[1]],
        [INDIA_BOUNDS[2], INDIA_BOUNDS[3]],
      ],
    });

    mapRef.current.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      const insideIndia =
        lng >= INDIA_BOUNDS[0] &&
        lng <= INDIA_BOUNDS[2] &&
        lat >= INDIA_BOUNDS[1] &&
        lat <= INDIA_BOUNDS[3];

      if (!insideIndia) return;
      if (!selectedPickup) void setRouteLocation("pickup", lng, lat);
      else void setRouteLocation("dropoff", lng, lat);
    });
  }, [selectedPickup, showMap]);

  useEffect(() => {
    const timer = setTimeout(
      () => void searchLocation(pickupQuery, "pickup"),
      350,
    );
    return () => clearTimeout(timer);
  }, [pickupQuery]);

  useEffect(() => {
    const timer = setTimeout(
      () => void searchLocation(dropoffQuery, "dropoff"),
      350,
    );
    return () => clearTimeout(timer);
  }, [dropoffQuery]);

  useEffect(() => {
    if (!selectedPickup || !selectedDropoff) return;
    void fetchRoute();
  }, [selectedPickup, selectedDropoff]);

  const syncRouteData = (patch: Record<string, unknown>) => {
    updateFormData({
      ...formData,
      route: {
        ...formData.route,
        ...patch,
      },
    });
  };

  const addMarker = (type: "pickup" | "dropoff", lng: number, lat: number) => {
    if (!mapRef.current) return;

    const markerColor = type === "pickup" ? "#22c55e" : "#ef4444";
    const markerRef = type === "pickup" ? pickupMarkerRef : dropoffMarkerRef;
    if (markerRef.current) markerRef.current.remove();

    markerRef.current = new mapboxgl.Marker({ color: markerColor })
      .setLngLat([lng, lat])
      .addTo(mapRef.current);
  };

  const reverseGeocode = async (lng: number, lat: number) => {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}`;
    const response = await fetch(url);
    const data = await response.json();
    return (
      data.features?.[0]?.place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    );
  };

  const setRouteLocation = async (
    type: "pickup" | "dropoff",
    lng: number,
    lat: number,
  ) => {
    const place = await reverseGeocode(lng, lat);

    if (type === "pickup") {
      setPickupQuery(place);
      setSelectedPickup({ lat, lng });
      addMarker("pickup", lng, lat);
      syncRouteData({ pickup: place, pickup_lat: lat, pickup_lng: lng });
    } else {
      setDropoffQuery(place);
      setSelectedDropoff({ lat, lng });
      addMarker("dropoff", lng, lat);
      syncRouteData({ dropoff: place, drop_lat: lat, drop_lng: lng });
    }
  };

  const searchLocation = async (query: string, type: "pickup" | "dropoff") => {
    if (!query.trim()) {
      if (type === "pickup") setPickupSuggestions([]);
      else setDropoffSuggestions([]);
      return;
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query,
    )}.json?access_token=${mapboxgl.accessToken}&autocomplete=true&limit=5&country=in`;
    const response = await fetch(url);
    const data = await response.json();
    const suggestions = data.features || [];

    if (type === "pickup") setPickupSuggestions(suggestions);
    else setDropoffSuggestions(suggestions);
  };

  const handleSelectSuggestion = async (
    type: "pickup" | "dropoff",
    suggestion: any,
  ) => {
    const [lng, lat] = suggestion.center;
    if (mapRef.current) mapRef.current.flyTo({ center: [lng, lat], zoom: 13 });

    if (type === "pickup") {
      setPickupSuggestions([]);
      await setRouteLocation("pickup", lng, lat);
    } else {
      setDropoffSuggestions([]);
      await setRouteLocation("dropoff", lng, lat);
    }
  };

  const fetchRoute = async () => {
    if (!selectedPickup || !selectedDropoff || !mapRef.current) return;

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${selectedPickup.lng},${selectedPickup.lat};${selectedDropoff.lng},${selectedDropoff.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.routes?.length) return;

    const route = data.routes[0].geometry;
    if (mapRef.current.getSource("route")) {
      mapRef.current.removeLayer("route");
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
  };

  const routeReady =
    formData.route.pickup_lat !== null &&
    formData.route.pickup_lng !== null &&
    formData.route.drop_lat !== null &&
    formData.route.drop_lng !== null;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-4 md:p-5">
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
              onChange={(event) => setPickupQuery(event.target.value)}
              placeholder="Search pickup location"
            />
            {pickupSuggestions.length > 0 && (
              <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
                {pickupSuggestions.map((suggestion, index) => (
                  <li
                    key={index}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() =>
                      void handleSelectSuggestion("pickup", suggestion)
                    }
                  >
                    {suggestion.place_name}
                  </li>
                ))}
              </ul>
            )}
            {errors.pickup ? (
              <p className="mt-1 text-xs text-destructive">{errors.pickup}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Dropoff</Label>
            <Input
              value={dropoffQuery}
              onChange={(event) => setDropoffQuery(event.target.value)}
              placeholder="Search dropoff location"
            />
            {dropoffSuggestions.length > 0 && (
              <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
                {dropoffSuggestions.map((suggestion, index) => (
                  <li
                    key={index}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() =>
                      void handleSelectSuggestion("dropoff", suggestion)
                    }
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
          <p className="mt-3 text-xs text-destructive">
            {errors.routeCoordinates}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4 md:p-5">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-foreground">Route map</p>
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => setShowMap((prev) => !prev)}
          >
            {showMap ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {showMap ? "Hide map" : "Show map"}
          </Button>
        </div>
        {showMap ? (
          <div className="overflow-hidden rounded-lg border border-border/70">
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
