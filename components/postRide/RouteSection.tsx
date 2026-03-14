"use client";

import { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import Icon from "@/components/AppIcon";
import { Eye, EyeOff, Navigation } from "lucide-react";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface RouteSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
  errors: Record<string, string>;
}

export default function RouteSection({
  formData,
  updateFormData,
  errors,
}: RouteSectionProps) {
  const [showMap, setShowMap] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const indiaBounds: [number, number, number, number] = [
    68.1766451354, 6.74713827189, 97.4025614766, 35.4940095078,
  ];
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const [pickupQuery, setPickupQuery] = useState("");
  const [dropoffQuery, setDropoffQuery] = useState("");
  const [viaQuery, setViaQuery] = useState("");
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<any[]>([]);
  const [mapNotice, setMapNotice] = useState<string | null>(null);

  const [selectedPickup, setSelectedPickup] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [selectedDropoff, setSelectedDropoff] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const selectedPickupRef = useRef<{ lat: number; lng: number } | null>(null);
  const selectedDropoffRef = useRef<{ lat: number; lng: number } | null>(null);

  const hasMapToken = Boolean(mapboxgl.accessToken);

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current && showMap && hasMapToken) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v11",
        center: [77.209, 28.6139],
        zoom: 5,
        maxBounds: [
          [indiaBounds[0], indiaBounds[1]],
          [indiaBounds[2], indiaBounds[3]],
        ],
      });

      mapRef.current.on("click", (e) => {
        const { lng, lat } = e.lngLat;

        const insideIndia =
          lng >= indiaBounds[0] &&
          lng <= indiaBounds[2] &&
          lat >= indiaBounds[1] &&
          lat <= indiaBounds[3];

        if (!insideIndia) {
          setMapNotice("Please select a location within India.");
          return;
        }

        setMapNotice(null);

        if (!selectedPickupRef.current) {
          const location = { lat, lng };
          setSelectedPickup(location);
          selectedPickupRef.current = location;
          addMarker("pickup", lng, lat);
          reverseGeocode("pickup", lng, lat);
        } else {
          const location = { lat, lng };
          setSelectedDropoff(location);
          selectedDropoffRef.current = location;
          addMarker("dropoff", lng, lat);
          reverseGeocode("dropoff", lng, lat);
        }
      });

      mapRef.current.on("load", () => {
        if (selectedPickupRef.current) {
          addMarker(
            "pickup",
            selectedPickupRef.current.lng,
            selectedPickupRef.current.lat,
          );
        }
        if (selectedDropoffRef.current) {
          addMarker(
            "dropoff",
            selectedDropoffRef.current.lng,
            selectedDropoffRef.current.lat,
          );
        }
        if (selectedPickupRef.current && selectedDropoffRef.current) {
          fetchRoute();
        }
      });
    }
  }, [indiaBounds, showMap, hasMapToken]);

  const fetchRoute = async () => {
    const pickup = selectedPickupRef.current ?? selectedPickup;
    const dropoff = selectedDropoffRef.current ?? selectedDropoff;
    const map = mapRef.current;
    if (!pickup || !dropoff || !map) return;

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0].geometry;

      if (map.getSource("route")) {
        map.removeLayer("route");
        map.removeSource("route");
      }

      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: route,
        },
      });

      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#3b82f6",
          "line-width": 5,
        },
      });

      const coordinates = route.coordinates;
      const bounds = coordinates.reduce(
        (b: mapboxgl.LngLatBounds, coord: [number, number]) => b.extend(coord),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]),
      );
      map.fitBounds(bounds, { padding: 50 });
    }
  };

  const clearRoute = () => {
    if (!mapRef.current) return;
    if (mapRef.current.getSource("route")) {
      mapRef.current.removeLayer("route");
      mapRef.current.removeSource("route");
    }
  };

  const addMarker = (type: "pickup" | "dropoff", lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;

    const markerColor = type === "pickup" ? "#22c55e" : "#ef4444";
    const markerRef = type === "pickup" ? pickupMarkerRef : dropoffMarkerRef;

    if (markerRef.current) markerRef.current.remove();

    const marker = new mapboxgl.Marker({ color: markerColor })
      .setLngLat([lng, lat])
      .addTo(map);

    markerRef.current = marker;
  };

  const reverseGeocode = async (
    type: "pickup" | "dropoff",
    lng: number,
    lat: number,
  ) => {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}`;
    const res = await fetch(url);
    const data = await res.json();
    const place =
      data.features?.[0]?.place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    if (type === "pickup") {
      setPickupQuery(place);
      updateFormData({
        ...formData,
        route: {
          ...formData.route,
          pickup: place,
          pickup_lat: lat,
          pickup_lng: lng,
        },
      });
    } else {
      setDropoffQuery(place);
      updateFormData({
        ...formData,
        route: {
          ...formData.route,
          dropoff: place,
          drop_lat: lat,
          drop_lng: lng,
        },
      });
    }
  };

  const searchLocation = async (query: string, type: "pickup" | "dropoff") => {
    if (!query) {
      if (type === "pickup") setPickupSuggestions([]);
      else setDropoffSuggestions([]);
      return;
    }
    if (!hasMapToken) return;

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query,
    )}.json?access_token=${mapboxgl.accessToken}&autocomplete=true&limit=5&country=in`;

    const res = await fetch(url);
    const data = await res.json();

    const suggestions = data.features || [];
    if (type === "pickup") setPickupSuggestions(suggestions);
    else setDropoffSuggestions(suggestions);
  };

  const handleSelectSuggestion = (
    type: "pickup" | "dropoff",
    suggestion: any,
  ) => {
    const [lng, lat] = suggestion.center;
    if (type === "pickup") {
      setPickupQuery(suggestion.place_name);
      setPickupSuggestions([]);
      const location = { lat, lng };
      setSelectedPickup(location);
      selectedPickupRef.current = location;
      updateFormData({
        ...formData,
        route: {
          ...formData.route,
          pickup: suggestion.place_name,
          pickup_lat: lat,
          pickup_lng: lng,
        },
      });
      addMarker("pickup", lng, lat);
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 13 });
    } else {
      setDropoffQuery(suggestion.place_name);
      setDropoffSuggestions([]);
      const location = { lat, lng };
      setSelectedDropoff(location);
      selectedDropoffRef.current = location;
      updateFormData({
        ...formData,
        route: {
          ...formData.route,
          dropoff: suggestion.place_name,
          drop_lat: lat,
          drop_lng: lng,
        },
      });
      addMarker("dropoff", lng, lat);
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 13 });
    }
    fetchRoute();
  };

  useEffect(() => {
    const delay = setTimeout(() => searchLocation(pickupQuery, "pickup"), 400);
    return () => clearTimeout(delay);
  }, [pickupQuery]);

  useEffect(() => {
    const delay = setTimeout(
      () => searchLocation(dropoffQuery, "dropoff"),
      400,
    );
    return () => clearTimeout(delay);
  }, [dropoffQuery]);

  useEffect(() => {
    if (selectedPickup && selectedDropoff) {
      fetchRoute();
    }
  }, [selectedPickup, selectedDropoff]);

  useEffect(() => {
    selectedPickupRef.current = selectedPickup;
  }, [selectedPickup]);

  useEffect(() => {
    selectedDropoffRef.current = selectedDropoff;
  }, [selectedDropoff]);

  useEffect(() => {
    setPickupQuery(formData.route.pickup || "");
    setDropoffQuery(formData.route.dropoff || "");
    setViaQuery(formData.route.via || "");
  }, [formData.route.pickup, formData.route.dropoff, formData.route.via]);

  useEffect(() => {
    return () => {
      pickupMarkerRef.current?.remove();
      dropoffMarkerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center">
            <Icon name="MapPin" size={20} className="mr-2 text-primary" />
            Route Details
          </h3>
          <p className="text-sm text-muted-foreground">
            Add the pickup and drop-off. Include an optional stop if needed.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (!hasMapToken) {
              setMapNotice(
                "Map is unavailable. Add a Mapbox token to enable it.",
              );
              return;
            }
            setShowMap(!showMap);
          }}
        >
          {showMap ? <EyeOff /> : <Eye />} {showMap ? "Hide" : "Show"} Map
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label>Pickup Location</Label>
          <Input
            value={pickupQuery}
            onChange={(e) => {
              const value = e.target.value;
              setPickupQuery(value);
              setSelectedPickup(null);
              selectedPickupRef.current = null;
              pickupMarkerRef.current?.remove();
              clearRoute();
              updateFormData({
                ...formData,
                route: {
                  ...formData.route,
                  pickup: value,
                  pickup_lat: null,
                  pickup_lng: null,
                },
              });
            }}
            placeholder="Campus pickup or nearby landmark"
          />
          {errors?.pickup && (
            <p className="text-xs text-error mt-1">{errors.pickup}</p>
          )}
          {pickupSuggestions.length > 0 && (
            <ul className="border rounded-lg mt-2 bg-card shadow max-h-48 overflow-y-auto text-foreground">
              {pickupSuggestions.map((s, i) => (
                <li
                  key={i}
                  className="p-2 hover:bg-muted cursor-pointer text-sm"
                  onClick={() => handleSelectSuggestion("pickup", s)}
                >
                  {s.place_name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <Label>Drop-off Location</Label>
          <Input
            value={dropoffQuery}
            onChange={(e) => {
              const value = e.target.value;
              setDropoffQuery(value);
              setSelectedDropoff(null);
              selectedDropoffRef.current = null;
              dropoffMarkerRef.current?.remove();
              clearRoute();
              updateFormData({
                ...formData,
                route: {
                  ...formData.route,
                  dropoff: value,
                  drop_lat: null,
                  drop_lng: null,
                },
              });
            }}
            placeholder="Destination campus or neighborhood"
          />
          {errors?.dropoff && (
            <p className="text-xs text-error mt-1">{errors.dropoff}</p>
          )}
          {dropoffSuggestions.length > 0 && (
            <ul className="border rounded-lg mt-2 bg-card shadow max-h-48 overflow-y-auto text-foreground">
              {dropoffSuggestions.map((s, i) => (
                <li
                  key={i}
                  className="p-2 hover:bg-muted cursor-pointer text-sm"
                  onClick={() => handleSelectSuggestion("dropoff", s)}
                >
                  {s.place_name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <Label>Optional Stop</Label>
          <Input
            value={viaQuery}
            onChange={(e) => {
              const value = e.target.value;
              setViaQuery(value);
              updateFormData({
                ...formData,
                route: { ...formData.route, via: value },
              });
            }}
            placeholder="Add a mid-point if you plan to pass by"
          />
        </div>
      </div>

      {showMap && hasMapToken && (
        <div className="mt-4 rounded-lg overflow-hidden border border-border">
          <div ref={mapContainerRef} className="w-full h-80 rounded-lg" />
        </div>
      )}

      {mapNotice && (
        <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
          <Navigation size={14} className="text-muted-foreground" />
          {mapNotice}
        </div>
      )}
    </div>
  );
}
