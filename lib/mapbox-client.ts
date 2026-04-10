export type MapboxLngLat = {
  lng: number;
  lat: number;
};

export type MapboxSuggestion = {
  place_name: string;
  center: [number, number];
};

export type MapboxRouteGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

export class MapboxClientError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function getMapboxToken() {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";
}

export function hasMapboxToken() {
  return getMapboxToken().length > 0;
}

function assertFiniteCoordinates(coords: MapboxLngLat) {
  if (!Number.isFinite(coords.lng) || !Number.isFinite(coords.lat)) {
    throw new MapboxClientError("INVALID_COORDINATES", "Invalid map coordinates.");
  }
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs = 10000,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const removeAbortListener =
    signal == null
      ? () => {}
      : (() => {
          const abort = () => controller.abort();
          signal.addEventListener("abort", abort, { once: true });
          return () => signal.removeEventListener("abort", abort);
        })();

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new MapboxClientError(
        "HTTP_ERROR",
        `Map request failed with status ${response.status}.`,
      );
    }
    return (await response.json()) as T;
  } catch (error: unknown) {
    if (error instanceof MapboxClientError) {
      throw error;
    }
    const maybeDom = error as { name?: string };
    if (maybeDom?.name === "AbortError") {
      throw new MapboxClientError("TIMEOUT", "Map request timed out.");
    }
    throw new MapboxClientError("NETWORK_ERROR", "Map request failed.");
  } finally {
    clearTimeout(timeout);
    removeAbortListener();
  }
}

export function normalizeMapboxError(error: unknown, fallback: string) {
  if (error instanceof MapboxClientError) {
    return error.message || fallback;
  }
  return fallback;
}

export async function geocodeSuggestions(params: {
  query: string;
  proximity?: MapboxLngLat | null;
  country?: string;
  limit?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}) {
  const token = getMapboxToken();
  if (!token) {
    throw new MapboxClientError("MISSING_TOKEN", "Mapbox token is missing.");
  }

  const query = params.query.trim();
  if (!query) {
    return [] as MapboxSuggestion[];
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", String(params.limit ?? 5));
  url.searchParams.set("country", params.country ?? "in");

  if (params.proximity) {
    assertFiniteCoordinates(params.proximity);
    url.searchParams.set(
      "proximity",
      `${params.proximity.lng},${params.proximity.lat}`,
    );
  }

  const payload = await fetchJsonWithTimeout<{ features?: MapboxSuggestion[] }>(
    url.toString(),
    params.timeoutMs ?? 8000,
    params.signal,
  );
  return Array.isArray(payload.features) ? payload.features : [];
}

export async function reverseGeocodeLocation(params: {
  coords: MapboxLngLat;
  timeoutMs?: number;
  signal?: AbortSignal;
}) {
  const token = getMapboxToken();
  if (!token) {
    throw new MapboxClientError("MISSING_TOKEN", "Mapbox token is missing.");
  }
  assertFiniteCoordinates(params.coords);

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${params.coords.lng},${params.coords.lat}.json`,
  );
  url.searchParams.set("access_token", token);

  const payload = await fetchJsonWithTimeout<{ features?: MapboxSuggestion[] }>(
    url.toString(),
    params.timeoutMs ?? 8000,
    params.signal,
  );
  const place = payload.features?.[0]?.place_name;
  return place || `${params.coords.lat.toFixed(4)}, ${params.coords.lng.toFixed(4)}`;
}

export async function fetchDrivingRoute(params: {
  pickup: MapboxLngLat;
  dropoff: MapboxLngLat;
  timeoutMs?: number;
  signal?: AbortSignal;
}) {
  const token = getMapboxToken();
  if (!token) {
    throw new MapboxClientError("MISSING_TOKEN", "Mapbox token is missing.");
  }
  assertFiniteCoordinates(params.pickup);
  assertFiniteCoordinates(params.dropoff);

  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${params.pickup.lng},${params.pickup.lat};${params.dropoff.lng},${params.dropoff.lat}`,
  );
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("access_token", token);

  const payload = await fetchJsonWithTimeout<{ routes?: Array<{ geometry?: MapboxRouteGeometry }> }>(
    url.toString(),
    params.timeoutMs ?? 10000,
    params.signal,
  );
  const geometry = payload.routes?.[0]?.geometry;
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    throw new MapboxClientError("NO_ROUTE", "No route available for selected points.");
  }
  return geometry;
}
