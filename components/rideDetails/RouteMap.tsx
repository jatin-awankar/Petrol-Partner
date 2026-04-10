"use client";

import React, { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import Icon from "../AppIcon";
import Skeleton from "react-loading-skeleton";
import { formatTimeToAmPm } from "@/lib/utils";
import {
  fetchDrivingRoute,
  hasMapboxToken,
  normalizeMapboxError,
} from "@/lib/mapbox-client";
import { Button } from "../ui/button";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

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
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!route?.pickup || !route?.dropoff) return;

    if (!hasMapboxToken()) {
      setMapError("Map token missing. Add NEXT_PUBLIC_MAPBOX_TOKEN to load route map.");
      return;
    }

    let cancelled = false;

    const initMap = async () => {
      try {
        if (!mapContainerRef.current) return;
        const pickup = route.pickup;
        const dropoff = route.dropoff;
        if (!pickup || !dropoff) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        if (
          !Number.isFinite(pickup.lat) ||
          !Number.isFinite(pickup.lng) ||
          !Number.isFinite(dropoff.lat) ||
          !Number.isFinite(dropoff.lng)
        ) {
          setMapError("Invalid route coordinates. Unable to render map.");
          return;
        }

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
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
          if (cancelled) return;

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
            const routeGeo = await fetchDrivingRoute({
              pickup: { lng: pickup.lng, lat: pickup.lat },
              dropoff: { lng: dropoff.lng, lat: dropoff.lat },
              timeoutMs: 10000,
            });

            if (map.getLayer("route-line")) map.removeLayer("route-line");
            if (map.getSource("route")) map.removeSource("route");

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
            setMapError(null);
          } catch (error) {
            setMapError(normalizeMapboxError(error, "Failed to load route line."));
          }
        });
      } catch (error) {
        setMapError(normalizeMapboxError(error, "Map initialization failed."));
      }
    };

    void initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [route, retryTick]);

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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/30 px-4 text-center">
            <p className="text-sm text-muted-foreground">{mapError}</p>
            <Button size="sm" variant="outline" onClick={() => setRetryTick((v) => v + 1)}>
              Retry map
            </Button>
          </div>
        ) : (
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <div className="flex items-center justify-between gap-3 text-white">
            <p className="text-sm font-medium truncate">
              {route?.pickup?.name ?? "Pickup"} to {route?.dropoff?.name ?? "Dropoff"}
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
