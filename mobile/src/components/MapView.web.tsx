import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Alert } from 'react-native';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Camera, CameraLocation } from '../services/api';

interface Props {
  privacyLine: [number, number][];
  standardLine: [number, number][];
  cameras: (Camera | CameraLocation)[];
  onMapLongPress?: (lat: number, lon: number) => void;
}

// SF default center
const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];
const DEFAULT_ZOOM = 13;

export function MapView({ privacyLine, standardLine, cameras, onMapLongPress }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      const m = map.current!;

      // Standard route layer — drawn FIRST so it's behind privacy route
      // Wider + outlined so it peeks out when routes share the same path
      m.addSource('standard-route', { type: 'geojson', data: emptyLine() });
      m.addLayer({
        id: 'standard-route-casing',
        type: 'line',
        source: 'standard-route',
        paint: {
          'line-color': '#ffffff',
          'line-width': 9,
          'line-opacity': 0.15,
        },
      });
      m.addLayer({
        id: 'standard-route-line',
        type: 'line',
        source: 'standard-route',
        paint: {
          'line-color': '#aaaaaa',
          'line-width': 4,
          'line-dasharray': [3, 4],
          'line-opacity': 0.9,
        },
      });

      // Privacy route layer (solid blue, on top)
      m.addSource('privacy-route', { type: 'geojson', data: emptyLine() });
      m.addLayer({
        id: 'privacy-route-casing',
        type: 'line',
        source: 'privacy-route',
        paint: { 'line-color': '#1a5fa8', 'line-width': 7 },
      });
      m.addLayer({
        id: 'privacy-route-line',
        type: 'line',
        source: 'privacy-route',
        paint: { 'line-color': '#4A90D9', 'line-width': 4 },
      });

      // Camera dots
      m.addSource('cameras', { type: 'geojson', data: emptyPoints() });
      m.addLayer({
        id: 'cameras-halo',
        type: 'circle',
        source: 'cameras',
        paint: {
          'circle-radius': 9,
          'circle-color': '#E74C3C',
          'circle-opacity': 0.2,
        },
      });
      m.addLayer({
        id: 'cameras-dot',
        type: 'circle',
        source: 'cameras',
        paint: {
          'circle-radius': 4,
          'circle-color': '#E74C3C',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
        },
      });

      // Camera popup on click
      m.on('click', 'cameras-dot', (e) => {
        const props = e.features?.[0]?.properties ?? {};
        const coords = (e.features?.[0]?.geometry as any).coordinates;
        new maplibregl.Popup()
          .setLngLat(coords)
          .setHTML(`<b>${props.operator ?? 'Unknown ALPR'}</b><br>conf: ${props.confidence ?? '?'}`)
          .addTo(m);
      });

      m.on('mouseenter', 'cameras-dot', () => {
        m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', 'cameras-dot', () => {
        m.getCanvas().style.cursor = '';
      });

      // Long press / context menu to report camera
      if (onMapLongPress) {
        m.on('contextmenu', (e) => {
          onMapLongPress(e.lngLat.lat, e.lngLat.lng);
        });
      }
    });

    return () => { map.current?.remove(); map.current = null; };
  }, []);

  // Update route lines when they change
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return;
    const m = map.current;

    const privacySource = m.getSource('privacy-route') as maplibregl.GeoJSONSource;
    const standardSource = m.getSource('standard-route') as maplibregl.GeoJSONSource;

    if (privacySource) {
      privacySource.setData(privacyLine.length > 0
        ? { type: 'Feature', geometry: { type: 'LineString', coordinates: privacyLine }, properties: {} }
        : emptyLine()
      );
    }
    if (standardSource) {
      standardSource.setData(standardLine.length > 0
        ? { type: 'Feature', geometry: { type: 'LineString', coordinates: standardLine }, properties: {} }
        : emptyLine()
      );
    }

    // Fly to fit the route
    if (privacyLine.length > 0) {
      const lons = privacyLine.map(c => c[0]);
      const lats = privacyLine.map(c => c[1]);
      m.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 60, duration: 800 }
      );
    }
  }, [privacyLine, standardLine]);

  // Update camera dots when they change
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return;
    const source = map.current.getSource('cameras') as maplibregl.GeoJSONSource;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: cameras.map(c => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
        properties: {
          operator: c.operator ?? 'Unknown',
          confidence: (c as Camera).confidence ?? null,
        },
      })),
    });
  }, [cameras]);

  return (
    <div
      ref={mapContainer}
      style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}
    />
  );
}

function emptyLine() {
  return { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: [] }, properties: {} };
}
function emptyPoints() {
  return { type: 'FeatureCollection' as const, features: [] };
}
