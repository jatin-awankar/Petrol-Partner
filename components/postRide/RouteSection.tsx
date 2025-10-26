"use client";

import React, { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import Icon from "@/components/AppIcon";
import { Eye, EyeOff, Navigation } from "lucide-react";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

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
    68.1766451354,
    6.74713827189, // West, South
    97.4025614766,
    35.4940095078, // East, North
  ];
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const [pickupQuery, setPickupQuery] = useState("");
  const [dropoffQuery, setDropoffQuery] = useState("");
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<any[]>([]);
  const [routeGeoJSON, setRouteGeoJSON] =
    useState<mapboxgl.GeoJSONSourceRaw | null>(null);

  const [selectedPickup, setSelectedPickup] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [selectedDropoff, setSelectedDropoff] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // === Initialize map ===
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current && showMap) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v11",
        center: [77.209, 28.6139], // Delhi
        zoom: 5,
        maxBounds: [
          [indiaBounds[0], indiaBounds[1]],
          [indiaBounds[2], indiaBounds[3]],
        ],
      });

      // Allow user to select pickup/dropoff via click
      mapRef.current.on("click", (e) => {
        const { lng, lat } = e.lngLat;

        // Check if click is within India
        const insideIndia =
          lng >= indiaBounds[0] &&
          lng <= indiaBounds[2] &&
          lat >= indiaBounds[1] &&
          lat <= indiaBounds[3];

        if (!insideIndia) {
          alert("Please select a location within India 🇮🇳");
          return;
        }

        if (!selectedPickup) {
          setSelectedPickup({ lat, lng });
          addMarker("pickup", lng, lat);
          reverseGeocode("pickup", lng, lat);
        } else {
          setSelectedDropoff({ lat, lng });
          addMarker("dropoff", lng, lat);
          reverseGeocode("dropoff", lng, lat);
        }
      });
    }
  }, [showMap]);

  const fetchRoute = async () => {
    if (!selectedPickup || !selectedDropoff) return;

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${selectedPickup.lng},${selectedPickup.lat};${selectedDropoff.lng},${selectedDropoff.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0].geometry;

      // Remove existing route layer if any
      if (mapRef.current!.getSource("route")) {
        mapRef.current!.removeLayer("route");
        mapRef.current!.removeSource("route");
      }

      mapRef.current!.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: route,
        },
      });

      mapRef.current!.addLayer({
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

      // Fit map bounds to the route
      const coordinates = route.coordinates;
      const bounds = coordinates.reduce(
        (b: mapboxgl.LngLatBounds, coord: [number, number]) => b.extend(coord),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      );
      mapRef.current!.fitBounds(bounds, { padding: 50 });
    }
  };

  // === Add marker helper ===
  const addMarker = (type: "pickup" | "dropoff", lng: number, lat: number) => {
    const markerColor = type === "pickup" ? "#22c55e" : "#ef4444";
    const markerRef = type === "pickup" ? pickupMarkerRef : dropoffMarkerRef;

    if (markerRef.current) markerRef.current.remove();

    const marker = new mapboxgl.Marker({ color: markerColor })
      .setLngLat([lng, lat])
      .addTo(mapRef.current!);

    markerRef.current = marker;
  };

  // === Reverse Geocode (coords → address) ===
  const reverseGeocode = async (
    type: "pickup" | "dropoff",
    lng: number,
    lat: number
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
        route: { ...formData.route, pickup: place },
      });
    } else {
      setDropoffQuery(place);
      updateFormData({
        ...formData,
        route: { ...formData.route, dropoff: place },
      });
    }
  };

  // === Search Locations (address → suggestions) ===
  const searchLocation = async (query: string, type: "pickup" | "dropoff") => {
    if (!query) {
      if (type === "pickup") setPickupSuggestions([]);
      else setDropoffSuggestions([]);
      return;
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query
    )}.json?access_token=${
      mapboxgl.accessToken
    }&autocomplete=true&limit=5&country=in`;

    const res = await fetch(url);
    const data = await res.json();

    const suggestions = data.features || [];
    if (type === "pickup") setPickupSuggestions(suggestions);
    else setDropoffSuggestions(suggestions);
  };

  // === When user selects a suggestion ===
  const handleSelectSuggestion = (
    type: "pickup" | "dropoff",
    suggestion: any
  ) => {
    const [lng, lat] = suggestion.center;
    if (type === "pickup") {
      setPickupQuery(suggestion.place_name);
      setPickupSuggestions([]);
      setSelectedPickup({ lat, lng });
      addMarker("pickup", lng, lat);
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 13 });
    } else {
      setDropoffQuery(suggestion.place_name);
      setDropoffSuggestions([]);
      setSelectedDropoff({ lat, lng });
      addMarker("dropoff", lng, lat);
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 13 });
    }
    fetchRoute();
  };

  // === Live search typing ===
  useEffect(() => {
    const delay = setTimeout(() => searchLocation(pickupQuery, "pickup"), 400);
    return () => clearTimeout(delay);
  }, [pickupQuery]);

  useEffect(() => {
    const delay = setTimeout(
      () => searchLocation(dropoffQuery, "dropoff"),
      400
    );
    return () => clearTimeout(delay);
  }, [dropoffQuery]);

  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-card">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold flex items-center">
          <Icon name="MapPin" size={20} className="mr-2 text-primary" />
          Route Details
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowMap(!showMap)}
        >
          {showMap ? <EyeOff /> : <Eye />} {showMap ? "Hide" : "Show"} Map
        </Button>
      </div>

      {/* Inputs */}
      <div className="space-y-4">
        {/* Pickup */}
        <div>
          <Label>Pickup Location</Label>
          <Input
            value={pickupQuery}
            onChange={(e) => setPickupQuery(e.target.value)}
            placeholder="Search pickup location"
          />
          {pickupSuggestions.length > 0 && (
            <ul className="border rounded-lg mt-2 bg-background shadow max-h-48 overflow-y-auto text-foreground">
              {pickupSuggestions.map((s, i) => (
                <li
                  key={i}
                  className="p-2 hover:bg-gray-800 cursor-pointer text-sm"
                  onClick={() => handleSelectSuggestion("pickup", s)}
                >
                  {s.place_name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Dropoff */}
        <div>
          <Label>Dropoff Location</Label>
          <Input
            value={dropoffQuery}
            onChange={(e) => setDropoffQuery(e.target.value)}
            placeholder="Search dropoff location"
          />
          {dropoffSuggestions.length > 0 && (
            <ul className="border rounded-lg mt-2 bg-background shadow max-h-48 overflow-y-auto text-foreground">
              {dropoffSuggestions.map((s, i) => (
                <li
                  key={i}
                  className="p-2 hover:bg-gray-800 cursor-pointer text-sm"
                  onClick={() => handleSelectSuggestion("dropoff", s)}
                >
                  {s.place_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Map */}
      {showMap && (
        <div className="mt-4 rounded-lg overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-80 rounded-lg" />
        </div>
      )}
    </div>
  );
}
