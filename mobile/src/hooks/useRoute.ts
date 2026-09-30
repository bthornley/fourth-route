import { useState, useCallback, useRef } from 'react';
import {
  fetchRouteComparison,
  fetchCamerasNearby,
  routeToGeoJSON,
  CompareResult,
  Camera,
} from '../services/api';
import { VehicleType } from '../services/fuel';

export interface RouteState {
  loading: boolean;
  error: string | null;
  result: CompareResult | null;
  vehicle: VehicleType;
  privacyLine: [number, number][];
  standardLine: [number, number][];
  cameras: Camera[];
}

export function useRoute() {
  const [state, setState] = useState<RouteState>({
    loading: false,
    error: null,
    result: null,
    vehicle: 'gas_avg',
    privacyLine: [],
    standardLine: [],
    cameras: [],
  });

  const activeReqId = useRef(0);

  const requestRoute = useCallback(async (
    originLat: number, originLon: number,
    destLat: number, destLon: number,
    exclusionRadiusM = 120,
    vehicle: VehicleType = 'gas_avg',
  ) => {
    const reqId = ++activeReqId.current;
    setState(s => ({ ...s, loading: true, error: null, vehicle }));
    try {
      const result = await fetchRouteComparison(
        originLat, originLon, destLat, destLon, exclusionRadiusM,
      );
      if (reqId !== activeReqId.current) return;

      const privacyLine  = result.privacy_route
        ? routeToGeoJSON(result.privacy_route.route)
        : [];
      const standardLine = routeToGeoJSON(result.standard_route.route);

      // Fetch cameras covering the full route bounding box + 20% padding.
      // Cap at 50km (API limit). For very long cross-state routes the map
      // already shows all cameras from the initial load — skip the fetch.
      const midLat  = (originLat + destLat) / 2;
      const midLon  = (originLon + destLon) / 2;
      const dLat = Math.abs(originLat - destLat) * 111_000;
      const dLon = Math.abs(originLon - destLon) * 111_000 * Math.cos(midLat * Math.PI / 180);
      const rawRadius = Math.sqrt(dLat * dLat + dLon * dLon) / 2 * 1.3;
      const radiusM = Math.min(50_000, Math.max(5_000, rawRadius));

      let cameras: any[] = [];
      if (rawRadius <= 50_000) {
        // Short enough route — fetch specific nearby cameras
        cameras = await fetchCamerasNearby(midLat, midLon, radiusM);
        if (reqId !== activeReqId.current) return;
      }
      // For long routes, cameras are already visible from the map init fetch

      if (reqId !== activeReqId.current) return;
      setState({ loading: false, error: null, result, vehicle, privacyLine, standardLine, cameras });
    } catch (e: any) {
      if (reqId !== activeReqId.current) return;
      setState(s => ({ ...s, loading: false, error: e.message ?? 'Unknown error' }));
    }
  }, []);

  const clearRoute = useCallback(() => {
    activeReqId.current++; // Invalidate any in-flight route or camera requests
    setState(s => ({
      loading: false, error: null, result: null,
      vehicle: s.vehicle,          // keep vehicle selection across clears
      privacyLine: [], standardLine: [], cameras: [],
    }));
  }, []);

  return { ...state, requestRoute, clearRoute };
}
