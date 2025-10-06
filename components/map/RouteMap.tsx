// components/Map/RouteMap.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

interface LatLng {
  lat: number;
  lng: number;
}
interface Route {
  pickup?: { address?: string; lat?: number; lng?: number };
  dropoff?: { address?: string; lat?: number; lng?: number };
}

const haversineDistanceKm = (a: LatLng, b: LatLng) => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
};

export default function RouteMap({ route }: { route: Route | null }) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!route || !route.pickup || !route.dropoff) return;

    const hasCoords =
      route.pickup.lat != null &&
      route.pickup.lng != null &&
      route.dropoff.lat != null &&
      route.dropoff.lng != null;

    if (!hasCoords) {
      setError("No coordinates for route.");
      return;
    }

    if (!MAPBOX_TOKEN) {
      setError("Mapbox token not configured — showing fallback info.");
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    if (!mapRef.current && mapContainer.current) {
      try {
        mapRef.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: "mapbox://styles/mapbox/streets-v11",
          center: [route.pickup.lng!, route.pickup.lat!],
          zoom: 12,
        });

        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([route.pickup.lng!, route.pickup.lat!]);
        bounds.extend([route.dropoff.lng!, route.dropoff.lat!]);
        mapRef.current.fitBounds(bounds, { padding: 60 });

        // add markers
        new mapboxgl.Marker({ color: "#0ea5a4" })
          .setLngLat([route.pickup.lng!, route.pickup.lat!])
          .setPopup(
            new mapboxgl.Popup().setText(route.pickup.address || "Pickup")
          )
          .addTo(mapRef.current);

        new mapboxgl.Marker({ color: "#ef4444" })
          .setLngLat([route.dropoff.lng!, route.dropoff.lat!])
          .setPopup(
            new mapboxgl.Popup().setText(route.dropoff.address || "Dropoff")
          )
          .addTo(mapRef.current);

        // draw simple line
        mapRef.current.on("load", () => {
          if (!mapRef.current) return;
          if (mapRef.current.getSource("route")) {
            // remove
            if (mapRef.current.getLayer("route-line"))
              mapRef.current.removeLayer("route-line");
            mapRef.current.removeSource("route");
          }
          mapRef.current.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: [
                  [route.pickup!.lng!, route.pickup!.lat!],
                  [route.dropoff!.lng!, route.dropoff!.lat!],
                ],
              },
            },
          });
          mapRef.current.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#2563eb",
              "line-width": 4,
              "line-opacity": 0.8,
            },
          });
        });
      } catch (e) {
        console.error("Mapbox error", e);
        setError("Map failed to load.");
      }
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [route, MAPBOX_TOKEN]);

  if (!route) {
    return <div className="h-48 bg-muted rounded-xl">No route provided</div>;
  }

  const pickup = route.pickup;
  const dropoff = route.dropoff;

  if (!MAPBOX_TOKEN || error) {
    // Fallback: distance & ETA via Haversine
    if (!pickup?.lat || !pickup?.lng || !dropoff?.lat || !dropoff?.lng) {
      return (
        <div className="h-48 bg-muted rounded-xl p-4">
          <div className="text-sm">
            Route: {pickup?.address} → {dropoff?.address}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            No coordinates available
          </div>
        </div>
      );
    }

    const distanceKm = haversineDistanceKm(
      { lat: pickup.lat, lng: pickup.lng },
      { lat: dropoff.lat, lng: dropoff.lng }
    );
    const avgSpeedKmh = 30; // conservative average speed in city
    const etaMinutes = Math.round((distanceKm / avgSpeedKmh) * 60);

    return (
      <div className="h-48 bg-muted rounded-xl p-4">
        <div className="text-sm font-medium">
          {pickup.address} → {dropoff.address}
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Distance: {distanceKm.toFixed(1)} km
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Est. duration: {etaMinutes} min
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Note: Mapbox token missing or failed — map disabled.
        </div>
      </div>
    );
  }

  // If Mapbox is available, render container
  return (
    <div
      ref={mapContainer}
      className="h-56 w-full rounded-xl overflow-hidden"
    />
  );
}
