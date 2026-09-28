import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, Alert, Platform, ScrollView,
} from 'react-native';
import { MapView } from './src/components/MapView.web';
import { SearchPanel } from './src/components/SearchPanel';
import { RouteInfoSheet } from './src/components/RouteInfoSheet';
import { useRoute } from './src/hooks/useRoute';
import { reportCamera } from './src/services/api';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

export default function App() {
  const {
    loading, error, result, vehicle,
    privacyLine, standardLine, cameras,
    requestRoute, clearRoute,
  } = useRoute();

  const handleMapLongPress = useCallback(async (lat: number, lon: number) => {
    if (Platform.OS === 'web') {
      const operator = window.prompt('Camera operator (or leave blank):') ?? undefined;
      const notes = window.prompt('Notes (optional):') ?? undefined;
      try {
        await reportCamera(lat, lon, operator, notes);
        alert('Camera reported — thank you!');
      } catch (e) {
        alert('Failed to submit report');
      }
    }
  }, []);

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
          />
        </View>

        {/* Overlaid UI panels */}
        <View style={styles.overlay}>
          {/* Search panel at top */}
          <SearchPanel
            onRoute={requestRoute}
            onClear={clearRoute}
            loading={loading}
          />

          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          {/* Route info sheet when result is available */}
          {result && !loading && (
            <RouteInfoSheet result={result} vehicle={vehicle} />
          )}

          {/* Hint when idle */}
          {!result && !loading && !error && (
            <View style={styles.hint}>
              <Text style={styles.hintText}>
                Pick an origin + destination above, then tap Route →
              </Text>
              <Text style={styles.hintSub}>
                Right-click the map to report a camera
              </Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
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
    top: 0, left: 0, right: 0,
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
  hintText: { color: '#aaa', textAlign: 'center', fontSize: 13 },
  hintSub: { color: '#555', textAlign: 'center', fontSize: 11, marginTop: 4 },
});
