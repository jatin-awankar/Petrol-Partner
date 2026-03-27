"use client";

import React, { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

interface LatLng {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

interface RouteMapProps {
  route?: {
    pickup?: LatLng & { time?: string };
    dropoff?: LatLng & { time?: string };
    distance?: string;
    duration?: string;
    pickupTime?: string;
    dropoffTime?: string;
  };
  loading?: boolean;
}

const RouteMap: React.FC<RouteMapProps> = ({ route, loading = false }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  useEffect(() => {
    if (!route?.pickup || !route?.dropoff) return;

    if (!mapboxgl.accessToken) {
      setMapError("Mapbox token not found. Using fallback map.");
      return;
    }

    const initMap = async () => {
      if (!route?.pickup || !route?.dropoff) return;
      if (!mapboxgl.accessToken) {
        setMapError("Mapbox token not found. Using fallback map.");
        return;
      }

      try {
        // Cleanup previous instance
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const { pickup, dropoff } = route;

        // Initialize map
        const map = new mapboxgl.Map({
          container: mapContainerRef.current as HTMLElement,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [pickup.lng, pickup.lat],
          zoom: 11,
        });
        mapRef.current = map;

        map.addControl(
          new mapboxgl.NavigationControl({ showCompass: true }),
          "top-right"
        );

        map.on("load", async () => {
          setIsMapLoaded(true);

          // Add pickup & dropoff markers
          new mapboxgl.Marker({ color: "#22c55e" })
            .setLngLat([pickup.lng, pickup.lat])
            .setPopup(
              new mapboxgl.Popup({ offset: 12 }).setHTML(
                `<strong>${
                  pickup.name ?? "Pickup"
                }</strong><div style="font-size:12px">${
                  pickup.address ?? ""
                }</div>`
              )
            )
            .addTo(map);

          new mapboxgl.Marker({ color: "#ef4444" })
            .setLngLat([dropoff.lng, dropoff.lat])
            .setPopup(
              new mapboxgl.Popup({ offset: 12 }).setHTML(
                `<strong>${
                  dropoff.name ?? "Dropoff"
                }</strong><div style="font-size:12px">${
                  dropoff.address ?? ""
                }</div>`
              )
            )
            .addTo(map);

          // Fetch route from Mapbox Directions API
          try {
            const res = await fetch(
              `https://api.mapbox.com/directions/v5/mapbox/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`
            );
            const data = await res.json();

            if (!data.routes || data.routes.length === 0) {
              throw new Error("No route found");
            }

            const routeGeo = data.routes[0].geometry;

            // Add route line to map
            map.addSource("route", {
              type: "geojson",
              data: {
                type: "Feature",
                geometry: routeGeo,
                properties: {},
              },
            });

            map.addLayer({
              id: "route-line",
              type: "line",
              source: "route",
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": "#3b82f6",
                "line-width": 5,
                "line-opacity": 0.8,
              },
            });

            // Fit to route bounds
            const bounds = new mapboxgl.LngLatBounds();
            for (const coord of routeGeo.coordinates) {
              bounds.extend(coord as [number, number]);
            }
            map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
          } catch (err) {
            console.error("Directions API error:", err);
            setMapError("Failed to load route.");
          }
        });
      } catch (err) {
        console.error("Map init error:", err);
        setMapError("Map initialization failed.");
      }
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [route]);

  const googleEmbedSrc = () => {
    const p = route?.pickup;
    const d = route?.dropoff;
    if (!p || !d) return "";
    return `https://www.google.com/maps/dir/?api=1&origin=${p.lat},${p.lng}&destination=${d.lat},${d.lng}`;
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-soft p-4 space-y-3">
        <Skeleton height={200} />
        <div className="space-y-2">
          <Skeleton height={18} width="80%" />
          <Skeleton height={14} width="60%" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border shadow-soft overflow-hidden">
      <div className="relative h-48 md:h-64">
        {mapError ? (
          <iframe
            title="Ride Route (fallback)"
            src={googleEmbedSrc()}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0 w-full h-full border-0"
          />
        ) : (
          <div
            ref={mapContainerRef}
            className="absolute inset-0 w-full h-full"
          />
        )}

        {/* Overlay info */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center space-x-2">
              <Icon name="MapPin" size={16} />
              <span className="text-sm font-medium truncate">
                {route?.pickup?.name ?? "Pickup"} →{" "}
                {route?.dropoff?.name ?? "Dropoff"}
              </span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <div className="flex items-center space-x-1">
                <Icon name="Clock" size={14} />
                <span>{route?.duration ?? "—"}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Icon name="Navigation" size={14} />
                <span>{route?.distance ?? "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Route details section */}
      <div className="p-4 space-y-3">
        <div className="flex items-start space-x-3">
          <div className="flex flex-col items-center pt-1">
            <div className="w-3 h-3 bg-success rounded-full" />
            <div className="w-0.5 h-8 bg-border my-1" />
            <div className="w-3 h-3 bg-error rounded-full" />
          </div>

          <div className="flex-1 space-y-6">
            <div>
              <p className="text-sm font-medium text-foreground">
                {route?.pickup?.name ?? "Pickup"}
              </p>
              <p className="text-xs text-muted-foreground">
                {route?.pickup?.address ?? "-"}
              </p>
              {route?.pickupTime && (
                <p className="text-xs text-success font-medium">
                  Pickup: {route.pickupTime}
                </p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">
                {route?.dropoff?.name ?? "Dropoff"}
              </p>
              <p className="text-xs text-muted-foreground">
                {route?.dropoff?.address ?? "-"}
              </p>
              {route?.dropoffTime && (
                <p className="text-xs text-error font-medium">
                  Drop-off: {route.dropoffTime}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteMap;
