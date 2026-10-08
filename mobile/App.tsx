import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, Alert, Platform, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { MapView } from './src/components/MapView.web';
import { SearchPanel, StateKey, STATE_CONFIG } from './src/components/SearchPanel';
import { RouteInfoSheet } from './src/components/RouteInfoSheet';
import { useRoute } from './src/hooks/useRoute';
import { CameraReportModal } from './src/components/CameraReportModal';
import { AddToHomeScreen } from './src/components/AddToHomeScreen';

import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { track } from '@vercel/analytics';
import { AboutPage } from './src/pages/AboutPage';
import { PrivacyPolicy } from './src/pages/PrivacyPolicy';
import { TermsOfService } from './src/pages/TermsOfService';
import { ContactPage } from './src/pages/ContactPage';

function useNavigator() {
  const [path, setPath] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const navigate = useCallback((to: string) => {
    window.history.pushState(null, '', to);
    setPath(to);
    try {
      track('navigation', { page: to });
    } catch {}
  }, []);
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
  return { path, navigate };
}

function useSyncStatus(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://fourth-route-production.up.railway.app';
    fetch(`${API_BASE}/sync/status`)
      .then(r => r.json())
      .then(data => {
        const total: number = data.total_cameras ?? 0;
        const syncs: { finished_at: string; error: string | null }[] = data.recent_syncs ?? [];
        const lastGood = syncs.find((s: any) => !s.error);
        if (!lastGood || !total) return;
        const diffMs = Date.now() - new Date(lastGood.finished_at).getTime();
        const diffDays = Math.floor(diffMs / 86_400_000);
        const age = diffDays === 0 ? 'today'
          : diffDays === 1 ? 'yesterday'
          : `${diffDays}d ago`;
        setLabel(`📡 ${total.toLocaleString()} cameras · synced ${age}`);
      })
      .catch(() => {});
  }, []);
  return label;
}

export default function App() {
  const { path, navigate } = useNavigator();
  const syncStatus = useSyncStatus();

  const {
    loading, error, result, vehicle,
    privacyLine, standardLine, cameras,
    requestRoute, clearRoute,
  } = useRoute();

  const [reportModal, setReportModal] = useState<{ lat: number; lon: number } | null>(null);
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number; zoom: number } | undefined>(undefined);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const handleStateChange = useCallback((s: StateKey) => {
    setFlyTo({ ...STATE_CONFIG[s].center });
  }, []);

  const handleMapLongPress = useCallback((lat: number, lon: number) => {
    setReportModal({ lat, lon });
  }, []);

  // Detect standalone PWA launches from Home Screen & mark installed
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    if (isStandalone) {
      try {
        localStorage.setItem('fourth_route_pwa_installed', 'true');
        const hasLoggedFirst = localStorage.getItem('fourth_route_pwa_first_standalone');
        if (!hasLoggedFirst) {
          localStorage.setItem('fourth_route_pwa_first_standalone', 'true');
          const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
          track('pwa_installed', { method: 'first_standalone_launch', os: isIOS ? 'ios' : 'android' });
        }
        track('pwa_session_standalone');
      } catch {}
    }
  }, []);

  // Page routing
  if (path === '/about') return <><AboutPage navigate={navigate} /><Analytics /><SpeedInsights /></>;
  if (path === '/privacy') return <><PrivacyPolicy navigate={navigate} /><Analytics /><SpeedInsights /></>;
  if (path === '/terms') return <><TermsOfService navigate={navigate} /><Analytics /><SpeedInsights /></>;
  if (path === '/contact') return <><ContactPage navigate={navigate} /><Analytics /><SpeedInsights /></>;

  return (
    <>
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Map fills the screen */}
        <View style={styles.mapArea}>
          <MapView
            privacyLine={privacyLine}
            standardLine={standardLine}
            cameras={cameras}
            onMapLongPress={handleMapLongPress}
            flyTo={flyTo}
          />
          {syncStatus && (
            <View style={styles.syncBadge} pointerEvents="none">
              <Text style={styles.syncBadgeText}>{syncStatus}</Text>
            </View>
          )}
        </View>

        {/* Overlaid UI panels */}
        <View style={styles.overlay}>
          {/* Search panel at top */}
          <SearchPanel
            onRoute={(...args) => {
              setPanelCollapsed(true);
              requestRoute(...args);
            }}
            onClear={() => {
              setPanelCollapsed(false);
              clearRoute();
            }}
            loading={loading}
            onAbout={() => navigate('/about')}
            onStateChange={handleStateChange}
            hasRoute={!!result}
            collapsed={panelCollapsed}
            onToggleCollapsed={setPanelCollapsed}
          />

          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          {/* Route info sheet when result is available */}
          {result && !loading && (
            <RouteInfoSheet result={result} vehicle={vehicle} onClear={clearRoute} />
          )}

          {/* Hint when idle and search panel expanded */}
          {!result && !loading && !error && !panelCollapsed && (
            <View style={styles.hint}>
              <Text style={styles.hintText}>
                Pick an origin + destination above, then tap Route →
              </Text>
              <Text style={styles.hintSub}>
                Right-click (or long-press) the map to report a camera
              </Text>
            </View>
          )}

          {/* Footer links (hidden while a route sheet is open so they don't cover its buttons) */}
          {!result && (
          <View style={styles.footer} pointerEvents="box-none">
            {[
              ['About', '/about'],
              ['Privacy', '/privacy'],
              ['Terms', '/terms'],
              ['Contact', '/contact'],
            ].map(([label, path]) => (
              <TouchableOpacity key={path} onPress={() => navigate(path)}>
                <Text style={styles.footerLink}>{label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => Linking.openURL('https://ko-fi.com/fourthroute')}>
              <Text style={[styles.footerLink, { color: '#E8C97A' }]}>☕ Donate</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL('https://instagram.com/fourthroute')}>
              <Text style={[styles.footerLink, { color: '#f472b6' }]}>📷 @fourthroute</Text>
            </TouchableOpacity>
          </View>
          )}
        </View>
      </View>
    </SafeAreaView>
    {reportModal && (
      <CameraReportModal
        visible={!!reportModal}
        lat={reportModal.lat}
        lon={reportModal.lon}
        onSubmit={async (lat, lon, operator, notes) => {
          const { reportCamera } = await import('./src/services/api');
          await reportCamera(lat, lon, operator, notes);
          try {
            track('camera_reported', { operator: operator || 'unknown' });
          } catch {}
        }}
        onClose={() => setReportModal(null)}
      />
    )}
    <AddToHomeScreen />
    <Analytics />
    <SpeedInsights />
  </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0d0d1e' },
  container: { flex: 1 },
  mapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    position: 'absolute' as any,
    top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: 'box-none' as any,
  },
  errorBanner: {
    backgroundColor: '#E74C3C22',
    borderWidth: 1, borderColor: '#E74C3C',
    borderRadius: 10, margin: 10, padding: 10,
  },
  errorText: { color: '#E74C3C', fontSize: 13 },
  hint: {
    backgroundColor: '#1a1a2ecc',
    margin: 10, padding: 12,
    borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#333',
  },
  hintText: { color: '#eee', textAlign: 'center', fontSize: 13, fontWeight: '500' },
  hintSub: { color: '#aaa', textAlign: 'center', fontSize: 11, marginTop: 4 },
  footer: {
    position: 'absolute' as any,
    bottom: 52,
    left: 8, right: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    alignItems: 'center',
  },
  footerLink: {
    color: '#aaa',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(13,13,30,0.75)',
    borderRadius: 6,
  },
  syncBadge: {
    position: 'absolute' as any,
    bottom: 28,
    left: 8,
    backgroundColor: 'rgba(13,13,30,0.82)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  syncBadgeText: { color: '#aaa', fontSize: 10, letterSpacing: 0.2 },
});
