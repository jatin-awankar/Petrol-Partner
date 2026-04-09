"use client";

import React, { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import { formatTimeToAmPm } from "@/lib/utils";

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

  useEffect(() => {
    if (!route?.pickup || !route?.dropoff) return;

    if (!mapboxgl.accessToken) {
      setMapError("Mapbox token not found. Using fallback map.");
      return;
    }

    const initMap = async () => {
      try {
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const pickup = route?.pickup;
        const dropoff = route?.dropoff;
        if (!pickup || !dropoff) return;

        const map = new mapboxgl.Map({
          container: mapContainerRef.current as HTMLElement,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [pickup.lng, pickup.lat],
          zoom: 11,
        });

        mapRef.current = map;
        map.addControl(
          new mapboxgl.NavigationControl({ showCompass: true }),
          "top-right",
        );

        map.on("load", async () => {
          new mapboxgl.Marker({ color: "#22c55e" })
            .setLngLat([pickup.lng, pickup.lat])
            .setPopup(
              new mapboxgl.Popup({ offset: 12 }).setHTML(
                `<strong>${pickup.name ?? "Pickup"}</strong><div style=\"font-size:12px\">${pickup.address ?? ""}</div>`,
              ),
            )
            .addTo(map);

          new mapboxgl.Marker({ color: "#ef4444" })
            .setLngLat([dropoff.lng, dropoff.lat])
            .setPopup(
              new mapboxgl.Popup({ offset: 12 }).setHTML(
                `<strong>${dropoff.name ?? "Dropoff"}</strong><div style=\"font-size:12px\">${dropoff.address ?? ""}</div>`,
              ),
            )
            .addTo(map);

          try {
            const res = await fetch(
              `https://api.mapbox.com/directions/v5/mapbox/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`,
            );
            const data = await res.json();
            if (!data.routes || data.routes.length === 0)
              throw new Error("No route found");

            const routeGeo = data.routes[0].geometry;
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
                "line-color": "#2563eb",
                "line-width": 5,
                "line-opacity": 0.8,
              },
            });

            const bounds = new mapboxgl.LngLatBounds();
            for (const coord of routeGeo.coordinates) {
              bounds.extend(coord as [number, number]);
            }
            map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
          } catch {
            setMapError("Failed to load map route. Showing fallback view.");
          }
        });
      } catch {
        setMapError("Map initialization failed. Showing fallback view.");
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
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-soft space-y-3">
        <Skeleton height={220} />
        <Skeleton height={14} width="80%" />
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/20 shadow-soft overflow-hidden">
      <div className="relative h-52 md:h-64">
        {mapError ? (
          <iframe
            title="Ride Route"
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

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <div className="flex items-center justify-between gap-3 text-white">
            <p className="text-sm font-medium truncate">
              {route?.pickup?.name ?? "Pickup"} ?{" "}
              {route?.dropoff?.name ?? "Dropoff"}
            </p>
            <div className="flex items-center gap-2 text-xs shrink-0">
              <span className="inline-flex items-center gap-1">
                <Icon name="Clock3" size={12} />
                {route?.duration ?? "-"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="Navigation" size={12} />
                {route?.distance ?? "-"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="pt-1 flex flex-col items-center">
            <span className="w-3 h-3 rounded-full bg-success" />
            <span className="w-px h-8 bg-border my-1" />
            <span className="w-3 h-3 rounded-full bg-destructive" />
          </div>

          <div className="flex-1 space-y-4 min-w-0">
            <div>
              <p className="text-sm font-medium text-foreground truncate">
                {route?.pickup?.name ?? "Pickup"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {route?.pickup?.address ?? "-"}
              </p>
              <p className="text-xs text-success mt-0.5">
                Pickup: {formatTimeToAmPm(route?.pickupTime || "") || "-"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground truncate">
                {route?.dropoff?.name ?? "Dropoff"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {route?.dropoff?.address ?? "-"}
              </p>
              {route?.dropoffTime && (
                <p className="text-xs text-destructive mt-0.5">
                  Drop-off: {formatTimeToAmPm(route.dropoffTime)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RouteMap;
