import React, { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { track } from '@vercel/analytics';
import { Camera, CameraLocation, CameraOverviewCluster, API_BASE, fetchCameraAgency, fetchCameraOverview } from '../services/api';

interface Props {
  privacyLine: [number, number][];
  standardLine: [number, number][];
  cameras: (Camera | CameraLocation)[];
  onMapLongPress?: (lat: number, lon: number) => void;
  flyTo?: { lng: number; lat: number; zoom: number };
  userLocation?: { lat: number; lon: number } | null;
}

const DEFAULT_CENTER: [number, number] = [-97.0, 38.5];
const DEFAULT_ZOOM = 3.8;
const DETAIL_ZOOM_THRESHOLD = 7.5;

// Lighter map style — easier to read, cameras pop more
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

export function MapView({ privacyLine, standardLine, cameras, onMapLongPress, flyTo, userLocation }: Props) {
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
      clickTolerance: 6,
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

      // Nationwide spatial-density clusters for continental zoom (maxzoom < DETAIL_ZOOM_THRESHOLD)
      m.addSource('cameras-overview', { type: 'geojson', data: emptyPoints() });
      m.addLayer({
        id: 'cameras-overview-glow',
        type: 'circle',
        source: 'cameras-overview',
        maxzoom: DETAIL_ZOOM_THRESHOLD,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'count'],
            1, 4.0,
            25, 8.0,
            200, 14.0,
            1000, 22.0,
          ],
          'circle-color': '#E74C3C',
          'circle-opacity': [
            'interpolate', ['linear'], ['get', 'count'],
            1, 0.08,
            50, 0.16,
            500, 0.25,
          ],
        },
      });
      m.addLayer({
        id: 'cameras-overview-dot',
        type: 'circle',
        source: 'cameras-overview',
        maxzoom: DETAIL_ZOOM_THRESHOLD,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'count'],
            1, 2.0,
            15, 3.2,
            100, 4.8,
            500, 6.8,
            1400, 8.5,
          ],
          'circle-color': '#E74C3C',
          'circle-stroke-width': 0.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.88,
        },
      });
      m.on('click', 'cameras-overview-dot', (e) => {
        const coords = (e.features?.[0]?.geometry as any)?.coordinates;
        if (coords) {
          m.flyTo({ center: coords, zoom: 10.5, duration: 900 });
        }
      });
      m.on('mouseenter', 'cameras-overview-dot', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'cameras-overview-dot', () => { m.getCanvas().style.cursor = ''; });

      // Individual camera dots — rendered at state/metro zoom (minzoom >= DETAIL_ZOOM_THRESHOLD)
      m.addSource('cameras', { type: 'geojson', data: emptyPoints() });
      m.addLayer({
        id: 'cameras-halo',
        type: 'circle',
        source: 'cameras',
        minzoom: DETAIL_ZOOM_THRESHOLD,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            7.5, 6.0,
            10, 9.0,
            13, 13.0,
          ],
          'circle-color': '#E74C3C',
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            7.5, 0.07,
            12, 0.16,
          ],
        },
      });
      m.addLayer({
        id: 'cameras-dot',
        type: 'circle',
        source: 'cameras',
        minzoom: DETAIL_ZOOM_THRESHOLD,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            7.5, 3.0,
            10, 4.2,
            13, 5.5,
            16, 7.5,
          ],
          'circle-color': '#E74C3C',
          'circle-stroke-width': [
            'interpolate', ['linear'], ['zoom'],
            7.5, 0.8,
            11, 1.4,
            14, 2.0,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.92,
        },
      });

      let overviewActive = true;

      // Load nationwide 50-state overview clusters once; fall back cleanly to bbox if /overview isn't deployed yet
      fetchCameraOverview().then((clusters) => {
        const src = m.getSource('cameras-overview') as maplibregl.GeoJSONSource;
        if (src && clusters.length > 0) {
          src.setData(overviewToGeoJSON(clusters));
        } else {
          overviewActive = false;
          try {
            m.setLayerZoomRange('cameras-halo', 0, 24);
            m.setLayerZoomRange('cameras-dot', 0, 24);
          } catch {}
          loadViewportCameras();
        }
      });

      // Dynamic individual camera loading by bounding box (only when zoomed past DETAIL_ZOOM_THRESHOLD unless overview unavailable)
      const fetchCamerasBbox = (bbox: { min_lon: number; min_lat: number; max_lon: number; max_lat: number }) =>
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

      // Helper to fetch current viewport cameras with a 20% spatial padding buffer
      const loadViewportCameras = () => {
        if (overviewActive && m.getZoom() < DETAIL_ZOOM_THRESHOLD - 0.3) return;
        const b = m.getBounds();
        const spanLon = b.getEast() - b.getWest();
        const spanLat = b.getNorth() - b.getSouth();
        fetchCamerasBbox({
          min_lon: Math.max(b.getWest() - spanLon * 0.2, -180),
          min_lat: Math.max(b.getSouth() - spanLat * 0.2, -90),
          max_lon: Math.min(b.getEast() + spanLon * 0.2, 180),
          max_lat: Math.min(b.getNorth() + spanLat * 0.2, 90),
        });
      };

      // Foreground Copilot user location dot
      m.addSource('user-location', { type: 'geojson', data: emptyPoints() });
      m.addLayer({
        id: 'user-location-halo',
        type: 'circle',
        source: 'user-location',
        paint: { 'circle-radius': 16, 'circle-color': '#3b82f6', 'circle-opacity': 0.22 },
      });
      m.addLayer({
        id: 'user-location-dot',
        type: 'circle',
        source: 'user-location',
        paint: {
          'circle-radius': 7,
          'circle-color': '#2563eb',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Load detail cameras immediately if initial zoom starts zoomed in
      loadViewportCameras();

      // Reload by viewport on moveend (debounced) for fast dynamic browsing across all 50 states
      let moveTimer: ReturnType<typeof setTimeout>;
      m.on('moveend', () => {
        clearTimeout(moveTimer);
        moveTimer = setTimeout(loadViewportCameras, 350);
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

            const makeBadge = (label: string, bg: string, fg: string, border: string) => {
              const badge = document.createElement('span');
              badge.style.background = bg;
              badge.style.color = fg;
              badge.style.fontSize = '9px';
              badge.style.fontWeight = '700';
              badge.style.padding = '2px 5px';
              badge.style.borderRadius = '10px';
              badge.style.border = `1px solid ${border}`;
              badge.style.whiteSpace = 'nowrap';
              badge.textContent = label;
              return badge;
            };

            if (agency.has_verified_portal) {
              headerRow.appendChild(makeBadge('Portal Verified', '#ecfdf5', '#059669', '#a7f3d0'));
            } else {
              const ownerStyles: Record<string, [string, string, string, string]> = {
                private: ['Private / Retail / HOA', '#fffbeb', '#b45309', '#fde68a'],
                state: ['State / Federal', '#eff6ff', '#1d4ed8', '#bfdbfe'],
                federal: ['State / Federal', '#eff6ff', '#1d4ed8', '#bfdbfe'],
                police: ['Municipal / Sheriff', '#f1f5f9', '#475569', '#cbd5e1'],
                local_government: ['Municipal / Sheriff', '#f1f5f9', '#475569', '#cbd5e1'],
              };
              const [lbl, bg, fg, brd] =
                ownerStyles[agency.owner_type || ''] || ['Unverified Owner', '#f1f5f9', '#64748b', '#cbd5e1'];
              headerRow.appendChild(makeBadge(lbl, bg, fg, brd));
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

            const appendStatCell = (label: string, value: string, spanTwo = false) => {
              const cell = document.createElement('div');
              if (spanTwo) cell.style.gridColumn = 'span 2';
              const lblEl = document.createElement('span');
              lblEl.style.color = '#64748b';
              lblEl.style.fontSize = '10px';
              lblEl.style.display = 'block';
              lblEl.textContent = label;
              const valEl = document.createElement('strong');
              valEl.textContent = value;
              cell.appendChild(lblEl);
              cell.appendChild(valEl);
              grid.appendChild(cell);
            };

            appendStatCell(
              'Retention:',
              agency.portal_retention_days ? `${agency.portal_retention_days} days` : 'Not disclosed'
            );
            appendStatCell(
              '30d Searches:',
              agency.portal_searches_30d !== null && agency.portal_searches_30d !== undefined
                ? agency.portal_searches_30d.toLocaleString()
                : 'Not disclosed'
            );

            const hasReceivingCount =
              agency.portal_receiving_partners_count !== null &&
              agency.portal_receiving_partners_count !== undefined;
            appendStatCell(
              hasReceivingCount ? 'Outgoing Shares:' : 'Data Sharing Reach:',
              agency.portal_sharing_partners_count !== null &&
                agency.portal_sharing_partners_count !== undefined
                ? hasReceivingCount
                  ? `${agency.portal_sharing_partners_count} agencies`
                  : `Shared with ${agency.portal_sharing_partners_count} partner agencies`
                : 'Local only / Not disclosed',
              !hasReceivingCount
            );

            if (hasReceivingCount) {
              appendStatCell(
                'Incoming Feeds:',
                `${agency.portal_receiving_partners_count} agencies`
              );
            }

            if (
              agency.has_verified_portal ||
              (agency.portal_public_search_audit !== null &&
                agency.portal_public_search_audit !== undefined)
            ) {
              appendStatCell(
                'Public Search Audit:',
                agency.portal_public_search_audit ? 'Published ✓' : 'Not Publicly Published',
                true
              );
            }

            container.appendChild(grid);

            const partners = Array.isArray(agency.portal_sharing_partners)
              ? agency.portal_sharing_partners.filter(Boolean)
              : [];
            const prohibitedUses = (agency.portal_prohibited_uses || '').trim();
            if (partners.length > 0 || prohibitedUses) {
              const toggleBtn = document.createElement('button');
              toggleBtn.type = 'button';
              const baseLabel =
                partners.length > 0 && prohibitedUses
                  ? `View ${partners.length} Shared Partners & Policy`
                  : partners.length > 0
                    ? `View ${partners.length} Shared Partner Agencies`
                    : 'View Prohibited Uses Policy';
              toggleBtn.textContent = `${baseLabel} ▾`;
              toggleBtn.style.width = '100%';
              toggleBtn.style.background = '#f1f5f9';
              toggleBtn.style.border = '1px solid #cbd5e1';
              toggleBtn.style.borderRadius = '5px';
              toggleBtn.style.padding = '5px 8px';
              toggleBtn.style.fontSize = '10.5px';
              toggleBtn.style.fontWeight = '600';
              toggleBtn.style.color = '#1e293b';
              toggleBtn.style.cursor = 'pointer';
              toggleBtn.style.marginBottom = '6px';
              toggleBtn.style.textAlign = 'left';

              const detailsPanel = document.createElement('div');
              detailsPanel.style.display = 'none';
              detailsPanel.style.background = '#f8fafc';
              detailsPanel.style.border = '1px solid #e2e8f0';
              detailsPanel.style.borderRadius = '5px';
              detailsPanel.style.padding = '6px 8px';
              detailsPanel.style.marginBottom = '6px';
              detailsPanel.style.maxHeight = '140px';
              detailsPanel.style.overflowY = 'auto';
              detailsPanel.style.fontSize = '10.5px';
              detailsPanel.style.color = '#334155';

              if (prohibitedUses) {
                const policyTitle = document.createElement('div');
                policyTitle.style.fontWeight = '700';
                policyTitle.style.color = '#0f172a';
                policyTitle.style.marginBottom = '2px';
                policyTitle.textContent = 'Prohibited Uses:';
                const policyText = document.createElement('div');
                policyText.style.marginBottom = partners.length > 0 ? '6px' : '0';
                policyText.textContent = prohibitedUses;
                detailsPanel.appendChild(policyTitle);
                detailsPanel.appendChild(policyText);
              }

              if (partners.length > 0) {
                const partnersTitle = document.createElement('div');
                partnersTitle.style.fontWeight = '700';
                partnersTitle.style.color = '#0f172a';
                partnersTitle.style.marginBottom = '2px';
                partnersTitle.textContent = `Shared Partner Agencies (${partners.length}):`;
                detailsPanel.appendChild(partnersTitle);

                const shown = partners.slice(0, 15);
                const listEl = document.createElement('div');
                listEl.style.lineHeight = '1.35';
                listEl.textContent = shown.join(' · ');
                detailsPanel.appendChild(listEl);

                if (partners.length > 15) {
                  const moreEl = document.createElement('div');
                  moreEl.style.marginTop = '3px';
                  moreEl.style.fontStyle = 'italic';
                  moreEl.style.color = '#64748b';
                  moreEl.textContent = `…and ${partners.length - 15} more partner agencies`;
                  detailsPanel.appendChild(moreEl);
                }
              }

              toggleBtn.addEventListener('click', () => {
                const isOpen = detailsPanel.style.display === 'block';
                detailsPanel.style.display = isOpen ? 'none' : 'block';
                toggleBtn.textContent = `${baseLabel} ${isOpen ? '▾' : '▴'}`;
              });

              container.appendChild(toggleBtn);
              container.appendChild(detailsPanel);
            }

            // Verified enforcement actions / statewide statutory caps
            const civicActions = Array.isArray(agency.actions) ? agency.actions.slice(0, 2) : [];
            if (civicActions.length > 0) {
              civicActions.forEach(act => {
                const box = document.createElement('div');
                const isStatute = act.action_type === 'statute_cap';
                box.style.background = isStatute ? '#eff6ff' : '#fef2f2';
                box.style.border = `1px solid ${isStatute ? '#bfdbfe' : '#fecaca'}`;
                box.style.borderRadius = '6px';
                box.style.padding = '6px 8px';
                box.style.marginBottom = '6px';
                box.style.fontSize = '10.5px';
                box.style.lineHeight = '1.35';
                box.style.color = isStatute ? '#1e3a8a' : '#7f1d1d';

                const tagEl = document.createElement('div');
                tagEl.style.fontWeight = '700';
                tagEl.style.fontSize = '10px';
                tagEl.style.marginBottom = '2px';
                tagEl.textContent = isStatute
                  ? `⚖️ ${act.statute_or_vote || 'State ALPR Law'}${act.retention_cap_days ? ` · ${act.retention_cap_days}d Max Cap` : ''}`
                  : `🚨 ${act.statute_or_vote || 'Civic Action'} (${act.action_date})`;

                const headEl = document.createElement('div');
                headEl.textContent = act.headline;

                box.appendChild(tagEl);
                box.appendChild(headEl);
                container.appendChild(box);
              });
            }

            // Verified municipal contract status & spend
            if (agency.contract) {
              const c = agency.contract;
              const cBox = document.createElement('div');
              const isStopped = c.status === 'terminated' || c.status === 'switched' || c.status === 'expired';
              cBox.style.background = isStopped ? '#fffbeb' : '#f1f5f9';
              cBox.style.border = `1px solid ${isStopped ? '#fde68a' : '#cbd5e1'}`;
              cBox.style.borderRadius = '6px';
              cBox.style.padding = '5px 8px';
              cBox.style.marginBottom = '6px';
              cBox.style.fontSize = '10.5px';
              cBox.style.color = '#334155';

              const costStr = c.contract_value_usd
                ? ` · $${c.contract_value_usd.toLocaleString()}`
                : c.annual_cost_usd
                  ? ` · ~$${c.annual_cost_usd.toLocaleString()}/yr`
                  : '';
              cBox.textContent = `📄 Contract (${c.status.toUpperCase()}): ${c.vendor}${costStr}`;
              container.appendChild(cBox);
            }

            // Documented misuse / internal audit violations
            const incList = Array.isArray(agency.incidents) ? agency.incidents.slice(0, 2) : [];
            incList.forEach(inc => {
              const iBox = document.createElement('div');
              iBox.style.background = '#fef2f2';
              iBox.style.border = '1px solid #fca5a5';
              iBox.style.borderRadius = '6px';
              iBox.style.padding = '5px 8px';
              iBox.style.marginBottom = '6px';
              iBox.style.fontSize = '10.5px';
              iBox.style.color = '#7f1d1d';
              const tag = document.createElement('div');
              tag.style.fontWeight = '700';
              tag.style.fontSize = '10px';
              tag.textContent = `⚠️ Documented Misuse (${inc.incident_date})`;
              const txt = document.createElement('div');
              txt.textContent = inc.headline;
              iBox.appendChild(tag);
              iBox.appendChild(txt);
              container.appendChild(iBox);
            });

            // Federal grants / contracts (USASpending.gov)
            const fedList = Array.isArray(agency.federal_awards) ? agency.federal_awards.slice(0, 2) : [];
            fedList.forEach(aw => {
              const fBox = document.createElement('div');
              fBox.style.background = '#ecfdf5';
              fBox.style.border = '1px solid #a7f3d0';
              fBox.style.borderRadius = '6px';
              fBox.style.padding = '5px 8px';
              fBox.style.marginBottom = '6px';
              fBox.style.fontSize = '10.5px';
              fBox.style.color = '#065f46';
              fBox.textContent = `🏛️ Federal ${aw.award_type}: $${Math.round(aw.amount_usd).toLocaleString()} (${aw.awarding_agency})`;
              container.appendChild(fBox);
            });

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

            if (agency.agency_slug) {
              const hubLink = document.createElement('a');
              hubLink.href = `/portals?agency=${encodeURIComponent(agency.agency_slug)}`;
              hubLink.target = '_blank';
              hubLink.rel = 'noopener noreferrer';
              hubLink.style.display = 'block';
              hubLink.style.textAlign = 'center';
              hubLink.style.background = '#0f172a';
              hubLink.style.color = '#93c5fd';
              hubLink.style.fontWeight = '600';
              hubLink.style.fontSize = '10.5px';
              hubLink.style.padding = '5px 8px';
              hubLink.style.borderRadius = '5px';
              hubLink.style.border = '1px solid #334155';
              hubLink.style.textDecoration = 'none';
              hubLink.style.marginBottom = '6px';
              hubLink.textContent = '📊 Open Full Agency Dossier in Hub ↗';
              container.appendChild(hubLink);
            }

            // Contextual Commuter Lockdown / Broker Purge action link
            const lockdownLink = document.createElement('a');
            lockdownLink.href = '/lockdown';
            lockdownLink.style.display = 'block';
            lockdownLink.style.textAlign = 'center';
            lockdownLink.style.background = '#0f172a';
            lockdownLink.style.color = '#4ade80';
            lockdownLink.style.fontWeight = '600';
            lockdownLink.style.fontSize = '10.5px';
            lockdownLink.style.padding = '5px 8px';
            lockdownLink.style.borderRadius = '5px';
            lockdownLink.style.textDecoration = 'none';
            lockdownLink.style.marginBottom = '6px';
            lockdownLink.style.border = '1px solid #1e293b';
            lockdownLink.textContent = '🛡️ Purge Plate-Linked Broker Data & RF Shield →';
            lockdownLink.addEventListener('click', (ev) => {
              ev.preventDefault();
              try {
                track('camera_popup_lockdown_click');
              } catch {}
              window.history.pushState(null, '', '/lockdown');
              window.dispatchEvent(new PopStateEvent('popstate'));
            });
            container.appendChild(lockdownLink);

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

  // ── Update live user GPS dot when foreground Copilot is active ──────────────
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const update = () => {
      const src = m.getSource('user-location') as maplibregl.GeoJSONSource;
      if (!src) return;
      if (userLocation) {
        src.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [userLocation.lon, userLocation.lat] },
            properties: {},
          }],
        });
      } else {
        src.setData(emptyPoints());
      }
    };

    if (m.isStyleLoaded()) update();
    else m.once('load', update);
  }, [userLocation]);

  return (
    <div
      ref={mapContainer}
      style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}
    />
  );
}

function overviewToGeoJSON(clusters: CameraOverviewCluster[]) {
  return {
    type: 'FeatureCollection' as const,
    features: clusters.map(c => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
      properties: { count: c.count },
    })),
  };
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
