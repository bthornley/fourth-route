import React, { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { track } from '@vercel/analytics';
import { Camera, CameraLocation, API_BASE, fetchCameraAgency } from '../services/api';

interface Props {
  privacyLine: [number, number][];
  standardLine: [number, number][];
  cameras: (Camera | CameraLocation)[];
  onMapLongPress?: (lat: number, lon: number) => void;
  flyTo?: { lng: number; lat: number; zoom: number };
}

const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];
const DEFAULT_ZOOM = 12;

// Lighter map style — easier to read, cameras pop more
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

export function MapView({ privacyLine, standardLine, cameras, onMapLongPress, flyTo }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const hasTrackedBrowse = useRef(false);

  // ── Fly to state when selected ─────────────────────────────────────────────
  useEffect(() => {
    if (!flyTo || !map.current) return;
    map.current.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom, duration: 1200 });
  }, [flyTo]);

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
    (window as any)._map = m;
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

      // Fetch cameras via bbox endpoint (no limit) covering all 4 states
      const ALL_BBOX = { min_lon: -124.5, min_lat: 25.8, max_lon: -93.5, max_lat: 49.0 };
      const fetchCamerasBbox = (bbox: typeof ALL_BBOX) =>
        fetch(`${API_BASE}/cameras/bbox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bbox),
        })
          .then(r => r.json())
          .then((cams: Camera[]) => {
            const src = m.getSource('cameras') as maplibregl.GeoJSONSource;
            if (src) src.setData(camerasToGeoJSON(cams));
          })
          .catch(() => {});

      // Load all states on init
      fetchCamerasBbox(ALL_BBOX);

      // Reload by viewport on moveend (debounced) for performance at high zoom
      let moveTimer: ReturnType<typeof setTimeout>;
      m.on('moveend', () => {
        clearTimeout(moveTimer);
        moveTimer = setTimeout(() => {
          const b = m.getBounds();
          fetchCamerasBbox({
            min_lon: b.getWest(), min_lat: b.getSouth(),
            max_lon: b.getEast(), max_lat: b.getNorth(),
          });
        }, 400);
      });

      // Track active map browsing (once per session on user pan or zoom)
      const trackBrowse = () => {
        if (!hasTrackedBrowse.current) {
          hasTrackedBrowse.current = true;
          try {
            track('map_browsed');
          } catch {}
        }
      };

      m.on('dragend', trackBrowse);
      m.on('zoomend', (e: any) => {
        if (e.originalEvent) {
          trackBrowse();
        }
      });

      // Click → popup
      // Displays agency transparency data (retention, searches, sharing network)
      // from Eyes on Flock under CC BY-SA 4.0.
      m.on('click', 'cameras-dot', async (e) => {
        try {
          track('camera_inspected');
        } catch {}
        const props = e.features?.[0]?.properties ?? {};
        const coords = (e.features?.[0]?.geometry as any).coordinates;
        const camId = props.id ? Number(props.id) : null;

        const container = document.createElement('div');
        container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        container.style.fontSize = '12px';
        container.style.color = '#0f172a';
        container.style.minWidth = '230px';
        container.style.maxWidth = '290px';
        container.style.padding = '2px';

        const title = document.createElement('div');
        title.style.fontWeight = '700';
        title.style.fontSize = '13px';
        title.style.color = '#0f172a';
        title.style.marginBottom = '2px';
        title.textContent = String(props.operator || 'ALPR Camera');
        container.appendChild(title);

        const sub = document.createElement('div');
        sub.style.fontSize = '11px';
        sub.style.color = '#64748b';
        sub.style.marginBottom = '6px';
        sub.textContent = 'Loading transparency record...';
        container.appendChild(sub);

        new maplibregl.Popup({ maxWidth: '320px', closeButton: true })
          .setLngLat(coords)
          .setDOMContent(container)
          .addTo(m);

        if (camId) {
          const agency = await fetchCameraAgency(camId);
          if (agency) {
            try {
              track('camera_dossier_viewed', {
                has_verified_portal: agency.has_verified_portal,
                agency_type: agency.agency_type || 'unknown'
              });
            } catch {}
            container.innerHTML = '';

            // Top Header
            const headerRow = document.createElement('div');
            headerRow.style.display = 'flex';
            headerRow.style.alignItems = 'flex-start';
            headerRow.style.justifyContent = 'space-between';
            headerRow.style.gap = '6px';
            headerRow.style.marginBottom = '4px';

            const nameEl = document.createElement('div');
            nameEl.style.fontWeight = '700';
            nameEl.style.fontSize = '13px';
            nameEl.style.color = '#0f172a';
            nameEl.style.lineHeight = '1.25';
            nameEl.textContent = agency.display_agency_name || props.operator || 'Law Enforcement Agency';
            headerRow.appendChild(nameEl);

            if (agency.has_verified_portal) {
              const badge = document.createElement('span');
              badge.style.background = '#ecfdf5';
              badge.style.color = '#059669';
              badge.style.fontSize = '9px';
              badge.style.fontWeight = '700';
              badge.style.padding = '2px 5px';
              badge.style.borderRadius = '10px';
              badge.style.border = '1px solid #a7f3d0';
              badge.style.whiteSpace = 'nowrap';
              badge.textContent = 'Portal Verified';
              headerRow.appendChild(badge);
            }
            container.appendChild(headerRow);

            // Subtitle
            const subRow = document.createElement('div');
            subRow.style.fontSize = '11px';
            subRow.style.color = '#64748b';
            subRow.style.marginBottom = '8px';
            const locText = agency.jurisdiction_name ? `Area: ${agency.jurisdiction_name}` : '';
            const camText = agency.portal_cameras ? ` · ${agency.portal_cameras} cameras in fleet` : '';
            subRow.textContent = `${locText}${camText}`.trim() || 'Active surveillance node';
            container.appendChild(subRow);

            // Stats Grid
            const grid = document.createElement('div');
            grid.style.background = '#f8fafc';
            grid.style.border = '1px solid #e2e8f0';
            grid.style.borderRadius = '6px';
            grid.style.padding = '6px 8px';
            grid.style.marginBottom = '8px';
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = '1fr 1fr';
            grid.style.gap = '6px';
            grid.style.fontSize = '11px';

            const retBox = document.createElement('div');
            retBox.innerHTML = `<span style="color:#64748b; font-size:10px; display:block;">Retention:</span><strong>${agency.portal_retention_days ? `${agency.portal_retention_days} days` : 'Not disclosed'}</strong>`;
            grid.appendChild(retBox);

            const searchBox = document.createElement('div');
            searchBox.innerHTML = `<span style="color:#64748b; font-size:10px; display:block;">30d Searches:</span><strong>${agency.portal_searches_30d !== null && agency.portal_searches_30d !== undefined ? agency.portal_searches_30d.toLocaleString() : 'Not disclosed'}</strong>`;
            grid.appendChild(searchBox);

            const shareBox = document.createElement('div');
            shareBox.style.gridColumn = 'span 2';
            shareBox.innerHTML = `<span style="color:#64748b; font-size:10px; display:block;">Data Sharing Reach:</span><strong>${agency.portal_sharing_partners_count !== null && agency.portal_sharing_partners_count !== undefined ? `Shared with ${agency.portal_sharing_partners_count} partner agencies` : 'Local only / Not disclosed'}</strong>`;
            grid.appendChild(shareBox);

            container.appendChild(grid);

            // Portal link if available
            if (agency.portal_url) {
              const link = document.createElement('a');
              link.href = agency.portal_url;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              link.style.display = 'block';
              link.style.textAlign = 'center';
              link.style.background = '#2563eb';
              link.style.color = '#ffffff';
              link.style.fontWeight = '600';
              link.style.fontSize = '11px';
              link.style.padding = '5px 8px';
              link.style.borderRadius = '5px';
              link.style.textDecoration = 'none';
              link.style.marginBottom = '6px';
              link.textContent = 'View Official Transparency Portal ↗';
              link.addEventListener('click', () => {
                try {
                  track('transparency_portal_opened');
                } catch {}
              });
              container.appendChild(link);
            }

            // Attribution footer
            const attr = document.createElement('div');
            attr.style.fontSize = '9px';
            attr.style.color = '#94a3b8';
            attr.style.textAlign = 'center';
            attr.textContent = 'Data: Eyes on Flock (CC BY-SA 4.0)';
            container.appendChild(attr);
          } else {
            sub.textContent = 'OSM community verified camera';
          }
        }
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
        id: (c as Camera).id ?? null,
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
