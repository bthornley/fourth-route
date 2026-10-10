// API client — talks to the FastAPI backend
export const API_BASE = process.env.EXPO_PUBLIC_API_URL
  ?? 'https://fourth-route-production.up.railway.app';

export interface Camera {
  id: number;
  lat: number;
  lon: number;
  source: string;
  operator: string | null;
  direction: number | null;
  confidence: number;
}

export interface CameraAgencyTransparency {
  camera_id: number;
  statefp?: string;
  place_name?: string;
  county_name?: string;
  jurisdiction_level?: string;
  jurisdiction_name?: string;
  operator?: string;
  owner_name?: string;
  owner_type?: string;
  agency_slug?: string;
  display_agency_name?: string;
  agency_type?: string;
  portal_url?: string;
  portal_cameras?: number;
  portal_searches_30d?: number;
  portal_retention_days?: number;
  portal_vehicles_captured_30d?: number;
  portal_hotlist_hits_30d?: number;
  portal_hotlist_hit_rate?: number;
  portal_sharing_partners_count?: number;
  portal_sharing_partners?: string[];
  portal_prohibited_uses?: string;
  portal_public_search_audit?: boolean;
  portal_last_updated?: string;
  has_verified_portal: boolean;
  data_attribution: string;
}

export async function fetchCameraAgency(cameraId: number): Promise<CameraAgencyTransparency | null> {
  try {
    const res = await fetch(`${API_BASE}/cameras/${cameraId}/agency`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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
  /** Cameras on the fastest route (verified against route geometry). */
  cameras_in_corridor: number;
  /** Cameras in the trip's bounding box (context only). */
  cameras_in_area?: number;
  detection_radius_m?: number;
  privacy_route: {
    distance_miles: number;
    duration_seconds: number;
    cameras_avoided: number;
    /** Cameras still on the privacy route (verified). */
    cameras_unavoidable?: number;
    cameras_on_route?: number;
    route: ValhallaRoute;
  } | null;
  standard_route: {
    distance_miles: number;
    duration_seconds: number;
    cameras_on_route?: number;
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

// Fetch with a hard timeout — prevents silent hangs when routing service is down
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('Routing request timed out. Please try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function routeError(body: any, status: number, fallback: string): Error {
  const detail = (body?.detail ?? '') as string;
  if (detail.includes('400') || status === 502 || status === 503) {
    return new Error('Privacy routing is currently enabled in California & Nevada only. Camera data is live for this region.');
  }
  return new Error(detail || fallback);
}

export async function fetchPrivacyRoute(
  originLat: number, originLon: number,
  destLat: number, destLon: number,
  exclusionRadiusM = 40,
): Promise<RouteResult> {
  const res = await fetchWithTimeout(`${API_BASE}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin_lat: originLat, origin_lon: originLon,
      dest_lat: destLat, dest_lon: destLon,
      exclusion_radius_m: exclusionRadiusM, fallback: true,
    }),
  });
  if (!res.ok) throw routeError(await res.json().catch(() => ({})), res.status, `Route error: ${res.status}`);
  return res.json();
}

export async function fetchRouteComparison(
  originLat: number, originLon: number,
  destLat: number, destLon: number,
  exclusionRadiusM = 40,
): Promise<CompareResult> {
  const res = await fetchWithTimeout(`${API_BASE}/route/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin_lat: originLat, origin_lon: originLon,
      dest_lat: destLat, dest_lon: destLon,
      exclusion_radius_m: exclusionRadiusM, fallback: true,
      use_highways: 0.0,
    }),
  });
  if (!res.ok) throw routeError(await res.json().catch(() => ({})), res.status, `Compare error: ${res.status}`);
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

// ── Geocoding (proxied through our API) ──
// Address searches go to our API, which forwards them to Nominatim (OpenStreetMap).
// The browser never contacts Nominatim directly, so OSM never sees users' IPs or which
// user searched what. POST bodies keep addresses out of URL access logs.
// There is deliberately NO fallback to calling Nominatim directly if our API is down.

export async function geocodeSearch(q: string, viewbox?: string, signal?: AbortSignal): Promise<any[]> {
  const call = () => fetch(`${API_BASE}/geocode/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, viewbox, limit: 5 }),
    signal,
  });
  let res = await call();
  if (res.status === 503) {
    // Our API shares one Nominatim allowance (1 req/s) across all users; retry once.
    await new Promise(r => setTimeout(r, 1100));
    if (signal?.aborted) return [];
    res = await call();
  }
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function reverseGeocode(lat: number, lon: number): Promise<any | null> {
  const res = await fetch(`${API_BASE}/geocode/reverse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon }),
  });
  if (!res.ok) return null;
  return res.json();
}
