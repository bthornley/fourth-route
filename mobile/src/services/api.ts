// API client — talks to the FastAPI backend
// Change API_BASE for your network IP when testing on a physical device

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface Camera {
  id: number;
  lat: number;
  lon: number;
  source: string;
  operator: string | null;
  direction: number | null;
  confidence: number;
}

export interface RouteResult {
  status: 'avoided' | 'fallback';
  cameras_in_corridor: number;
  cameras_avoided: number;
  fallback: boolean;
  fallback_reason?: string;
  distance_miles: number;
  duration_seconds: number;
  route: ValhallaRoute;
  camera_locations: CameraLocation[];
}

export interface CompareResult {
  cameras_in_corridor: number;
  privacy_route: {
    distance_miles: number;
    duration_seconds: number;
    cameras_avoided: number;
    route: ValhallaRoute;
  } | null;
  standard_route: {
    distance_miles: number;
    duration_seconds: number;
    route: ValhallaRoute;
  };
  overhead: {
    extra_seconds: number;
    extra_miles: number;
    pct_slower: number;
  } | null;
  camera_locations: CameraLocation[];
}

export interface CameraLocation {
  lat: number;
  lon: number;
  operator: string | null;
}

export interface ValhallaRoute {
  trip: {
    summary: { length: number; time: number };
    legs: Array<{ shape: string; maneuvers: Maneuver[] }>;
  };
}

export interface Maneuver {
  instruction: string;
  street_names?: string[];
  length: number;
  time: number;
  type: number;
}

// Decode Valhalla's encoded polyline (precision 6)
export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / 1e6, lng / 1e6]);
  }
  return coords;
}

// Convert Valhalla route shape to GeoJSON LineString coordinates [lon, lat]
export function routeToGeoJSON(route: ValhallaRoute): [number, number][] {
  const leg = route.trip?.legs?.[0];
  if (!leg?.shape) return [];
  return decodePolyline(leg.shape).map(([lat, lon]) => [lon, lat]);
}

export async function fetchPrivacyRoute(
  originLat: number, originLon: number,
  destLat: number, destLon: number,
  exclusionRadiusM = 40,
): Promise<RouteResult> {
  const res = await fetch(`${API_BASE}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin_lat: originLat,
      origin_lon: originLon,
      dest_lat: destLat,
      dest_lon: destLon,
      exclusion_radius_m: exclusionRadiusM,
      fallback: true,
    }),
  });
  if (!res.ok) throw new Error(`Route error: ${res.status}`);
  return res.json();
}

export async function fetchRouteComparison(
  originLat: number, originLon: number,
  destLat: number, destLon: number,
  exclusionRadiusM = 40,
): Promise<CompareResult> {
  const res = await fetch(`${API_BASE}/route/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin_lat: originLat,
      origin_lon: originLon,
      dest_lat: destLat,
      dest_lon: destLon,
      exclusion_radius_m: exclusionRadiusM,
      fallback: true,
      use_highways: 0.0,   // privacy routing stays on surface streets where cameras are
    }),
  });
  if (!res.ok) throw new Error(`Compare error: ${res.status}`);
  return res.json();
}

export async function fetchCamerasNearby(
  lat: number, lon: number, radiusM = 1000,
): Promise<Camera[]> {
  const res = await fetch(`${API_BASE}/cameras/nearby`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, radius_m: radiusM }),
  });
  if (!res.ok) throw new Error(`Camera fetch error: ${res.status}`);
  return res.json();
}

export async function reportCamera(
  lat: number, lon: number,
  operator?: string, notes?: string,
): Promise<{ id: number; status: string }> {
  const res = await fetch(`${API_BASE}/cameras/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, operator, notes }),
  });
  if (!res.ok) throw new Error(`Report error: ${res.status}`);
  return res.json();
}
