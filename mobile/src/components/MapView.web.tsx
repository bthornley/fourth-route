import React, { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Camera, CameraLocation, API_BASE } from '../services/api';

interface Props {
  privacyLine: [number, number][];
  standardLine: [number, number][];
  cameras: (Camera | CameraLocation)[];
  onMapLongPress?: (lat: number, lon: number) => void;
}

const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];
const DEFAULT_ZOOM = 12;

// Lighter map style — easier to read, cameras pop more
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

export function MapView({ privacyLine, standardLine, cameras, onMapLongPress }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl(), 'top-right');

    m.on('load', () => {
      // Standard route — dark dashed, behind privacy
      m.addSource('standard-route', { type: 'geojson', data: emptyLine() });
      m.addLayer({
        id: 'standard-route-casing',
        type: 'line',
        source: 'standard-route',
        paint: { 'line-color': '#555', 'line-width': 8, 'line-opacity': 0.15 },
      });
      m.addLayer({
        id: 'standard-route-line',
        type: 'line',
        source: 'standard-route',
        paint: {
          'line-color': '#444',
          'line-width': 3.5,
          'line-dasharray': [3, 4],
          'line-opacity': 0.75,
        },
      });

      // Privacy route — solid blue on top
      m.addSource('privacy-route', { type: 'geojson', data: emptyLine() });
      m.addLayer({
        id: 'privacy-route-casing',
        type: 'line',
        source: 'privacy-route',
        paint: { 'line-color': '#1a5fa8', 'line-width': 8 },
      });
      m.addLayer({
        id: 'privacy-route-line',
        type: 'line',
        source: 'privacy-route',
        paint: { 'line-color': '#3b82f6', 'line-width': 5 },
      });

      // Camera dots — load ALL cameras eagerly so they show before routing
      m.addSource('cameras', { type: 'geojson', data: emptyPoints() });
      m.addLayer({
        id: 'cameras-halo',
        type: 'circle',
        source: 'cameras',
        paint: {
          'circle-radius': 14,
          'circle-color': '#E74C3C',
          'circle-opacity': 0.18,
        },
      });
      m.addLayer({
        id: 'cameras-dot',
        type: 'circle',
        source: 'cameras',
        paint: {
          'circle-radius': 6,
          'circle-color': '#E74C3C',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Fetch all cameras immediately on map load
      fetch(`${API_BASE}/cameras?limit=5000`)
        .then(r => r.json())
        .then((cams: Camera[]) => {
          const src = m.getSource('cameras') as maplibregl.GeoJSONSource;
          if (src) src.setData(camerasToGeoJSON(cams));
        })
        .catch(() => {/* silent — cameras will arrive via prop when route runs */});

      // Click → popup
      m.on('click', 'cameras-dot', (e) => {
        const props = e.features?.[0]?.properties ?? {};
        const coords = (e.features?.[0]?.geometry as any).coordinates;
        new maplibregl.Popup()
          .setLngLat(coords)
          .setHTML(`<b>${props.operator ?? 'Unknown ALPR'}</b><br>conf: ${props.confidence ?? '?'}`)
          .addTo(m);
      });
      m.on('mouseenter', 'cameras-dot', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'cameras-dot', () => { m.getCanvas().style.cursor = ''; });

      if (onMapLongPress) {
        m.on('contextmenu', (e) => { onMapLongPress(e.lngLat.lat, e.lngLat.lng); });
      }
    });

    return () => { map.current?.remove(); map.current = null; };
  }, []);

  // ── Update route lines ─────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const update = () => {
      const ps = m.getSource('privacy-route') as maplibregl.GeoJSONSource;
      const ss = m.getSource('standard-route') as maplibregl.GeoJSONSource;
      if (ps) ps.setData(privacyLine.length > 0
        ? { type: 'Feature', geometry: { type: 'LineString', coordinates: privacyLine }, properties: {} }
        : emptyLine());
      if (ss) ss.setData(standardLine.length > 0
        ? { type: 'Feature', geometry: { type: 'LineString', coordinates: standardLine }, properties: {} }
        : emptyLine());
      if (privacyLine.length > 0) {
        const lons = privacyLine.map(c => c[0]);
        const lats = privacyLine.map(c => c[1]);
        m.fitBounds(
          [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
          { padding: 60, duration: 800 }
        );
      }
    };

    if (m.isStyleLoaded()) update();
    else m.once('load', update);
  }, [privacyLine, standardLine]);

  // ── Update camera overlay when route-specific cameras arrive ───────────────
  useEffect(() => {
    if (cameras.length === 0) return;
    const m = map.current;
    if (!m) return;

    const update = () => {
      const src = m.getSource('cameras') as maplibregl.GeoJSONSource;
      if (src) src.setData(camerasToGeoJSON(cameras));
    };

    if (m.isStyleLoaded()) update();
    else m.once('load', update);
  }, [cameras]);

  return (
    <div
      ref={mapContainer}
      style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}
    />
  );
}

function camerasToGeoJSON(cams: (Camera | CameraLocation)[]) {
  return {
    type: 'FeatureCollection' as const,
    features: cams.map(c => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
      properties: {
        operator: c.operator ?? 'Unknown',
        confidence: (c as Camera).confidence ?? null,
      },
    })),
  };
}
function emptyLine() {
  return { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: [] }, properties: {} };
}
function emptyPoints() {
  return { type: 'FeatureCollection' as const, features: [] };
}
