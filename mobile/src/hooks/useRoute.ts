import { useState, useCallback } from 'react';
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

  const requestRoute = useCallback(async (
    originLat: number, originLon: number,
    destLat: number, destLon: number,
    exclusionRadiusM = 120,
    vehicle: VehicleType = 'gas_avg',
  ) => {
    setState(s => ({ ...s, loading: true, error: null, vehicle }));
    try {
      const result = await fetchRouteComparison(
        originLat, originLon, destLat, destLon, exclusionRadiusM,
      );

      const privacyLine  = result.privacy_route
        ? routeToGeoJSON(result.privacy_route.route)
        : [];
      const standardLine = routeToGeoJSON(result.standard_route.route);

      // Fetch cameras covering the full route bounding box + 20% padding
      const midLat  = (originLat + destLat) / 2;
      const midLon  = (originLon + destLon) / 2;
      // Haversine-ish: 1 deg lat ≈ 111km, use diagonal of bbox as radius
      const dLat = Math.abs(originLat - destLat) * 111_000;
      const dLon = Math.abs(originLon - destLon) * 111_000 * Math.cos(midLat * Math.PI / 180);
      const radiusM = Math.max(5_000, Math.sqrt(dLat * dLat + dLon * dLon) / 2 * 1.3);

      const cameras = await fetchCamerasNearby(midLat, midLon, radiusM);

      setState({ loading: false, error: null, result, vehicle, privacyLine, standardLine, cameras });
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, error: e.message ?? 'Unknown error' }));
    }
  }, []);

  const clearRoute = useCallback(() => {
    setState(s => ({
      loading: false, error: null, result: null,
      vehicle: s.vehicle,          // keep vehicle selection across clears
      privacyLine: [], standardLine: [], cameras: [],
    }));
  }, []);

  return { ...state, requestRoute, clearRoute };
}
