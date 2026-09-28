import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { VehicleType, VEHICLE_PROFILES } from '../services/fuel';

interface Props {
  onRoute: (
    originLat: number, originLon: number,
    destLat: number, destLon: number,
    radiusM: number,
    vehicle: VehicleType,
  ) => void;
  onClear: () => void;
  loading: boolean;
}

interface GeoResult {
  display_name: string;
  name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

// ── Nominatim autocomplete hook ────────────────────────────────────────────
function useGeocoder(query: string): GeoResult[] {
  const [results, setResults] = useState<GeoResult[]>([]);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=us&addressdetails=1`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'fourth-route/1.0 (+https://fourthroute.app)' },
        });
        const data: GeoResult[] = await res.json();
        setResults(data);
      } catch { setResults([]); }
    }, 380);
    return () => clearTimeout(timer.current);
  }, [query]);

  return results;
}

// ── Short label for a Nominatim result ────────────────────────────────────
function shortLabel(r: GeoResult): string {
  const a = r.address ?? {};
  const parts = [
    a.neighbourhood || a.suburb || a.quarter || a.district || a.town || a.village,
    a.city || a.county,
    a.state,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : r.display_name.split(',').slice(0, 2).join(',').trim();
}

// ── Single search field with dropdown ─────────────────────────────────────
function LocationInput({
  placeholder,
  color,
  value,
  onChange,
  onSelect,
}: {
  placeholder: string;
  color: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: GeoResult) => void;
}) {
  const [focused, setFocused] = useState(false);
  const results = useGeocoder(value);
  const showDrop = focused && results.length > 0 && value.length >= 2;

  return (
    <View style={{ position: 'relative' as any, zIndex: 10 }}>
      <View style={[styles.inputWrapper, focused && { borderColor: color }]}>
        <Text style={[styles.inputDot, { color }]}>●</Text>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#888"
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearX}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {showDrop && (
        <View style={styles.dropdown}>
          {results.map((r, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.dropItem, i < results.length - 1 && styles.dropDivider]}
              onPress={() => { onSelect(r); onChange(shortLabel(r)); setFocused(false); }}
            >
              <Text style={styles.dropMain} numberOfLines={1}>{shortLabel(r)}</Text>
              <Text style={styles.dropSub} numberOfLines={1}>{r.display_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────
export function SearchPanel({ onRoute, onClear, loading }: Props) {
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery,   setDestQuery]   = useState('');
  const [origin, setOrigin] = useState<GeoResult | null>(null);
  const [dest,   setDest]   = useState<GeoResult | null>(null);
  const [radiusM,  setRadiusM]  = useState(120);
  const [vehicle,  setVehicle]  = useState<VehicleType>('gas_avg');

  const canRoute = !!(origin && dest);

  const handleGo = () => {
    if (!canRoute) return;
    onRoute(
      parseFloat(origin!.lat), parseFloat(origin!.lon),
      parseFloat(dest!.lat),   parseFloat(dest!.lon),
      radiusM, vehicle,
    );
  };

  const handleClear = () => {
    setOriginQuery(''); setDestQuery('');
    setOrigin(null); setDest(null);
    onClear();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚖️ Fourth Route</Text>
      <Text style={styles.subtitle}>Navigate around ALPR surveillance</Text>

      {/* Origin */}
      <LocationInput
        placeholder="From — search any address or place"
        color="#4A90D9"
        value={originQuery}
        onChange={(v) => { setOriginQuery(v); if (!v) setOrigin(null); }}
        onSelect={(r) => setOrigin(r)}
      />

      <View style={{ height: 6 }} />

      {/* Destination */}
      <View style={{ zIndex: 9 }}>
        <LocationInput
          placeholder="To — search any address or place"
          color="#27AE60"
          value={destQuery}
          onChange={(v) => { setDestQuery(v); if (!v) setDest(null); }}
          onSelect={(r) => setDest(r)}
        />
      </View>

      {/* Vehicle */}
      <View style={styles.row}>
        <Text style={styles.label}>Vehicle</Text>
        <View style={styles.chipRow}>
          {(Object.entries(VEHICLE_PROFILES) as [VehicleType, typeof VEHICLE_PROFILES[VehicleType]][]).map(([key, p]) => (
            <TouchableOpacity
              key={key}
              style={[styles.chip, vehicle === key && styles.chipVehicle]}
              onPress={() => setVehicle(key)}
            >
              <Text style={[styles.chipText, vehicle === key && styles.chipTextActive]}>
                {p.emoji} {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Exclusion radius */}
      <View style={styles.row}>
        <Text style={styles.label}>Exclusion radius</Text>
        <View style={styles.chipRow}>
          {[20, 40, 80, 120].map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.chip, radiusM === r && styles.chipRadius]}
              onPress={() => setRadiusM(r)}
            >
              <Text style={[styles.chipText, radiusM === r && styles.chipTextActive]}>{r}m</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Buttons */}
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.goBtn, !canRoute && styles.goBtnDisabled]}
          onPress={handleGo}
          disabled={loading || !canRoute}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.goBtnText}>Route →</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Text style={styles.clearBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2eee',
    borderRadius: 16, padding: 12, margin: 10,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    backdropFilter: 'blur(8px)' as any,
  },
  title:    { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 2 },
  subtitle: { color: '#666', fontSize: 11, textAlign: 'center', marginBottom: 10 },

  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#11112a', borderRadius: 10,
    borderWidth: 1.5, borderColor: '#333',
    paddingHorizontal: 10, paddingVertical: 0,
    marginBottom: 0,
  },
  inputDot:  { fontSize: 10, marginRight: 8 },
  input:     { flex: 1, color: '#fff', fontSize: 13, paddingVertical: 9, outlineStyle: 'none' } as any,
  clearX:    { color: '#555', fontSize: 13, paddingLeft: 6 },

  dropdown: {
    position: 'absolute' as any,
    top: '100%', left: 0, right: 0,
    backgroundColor: '#1e1e3a',
    borderRadius: 10, borderWidth: 1, borderColor: '#333',
    marginTop: 3, zIndex: 999,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, elevation: 10,
  },
  dropItem:    { paddingHorizontal: 12, paddingVertical: 9 },
  dropDivider: { borderBottomWidth: 1, borderBottomColor: '#2a2a4a' },
  dropMain:    { color: '#eee', fontSize: 13, fontWeight: '500' },
  dropSub:     { color: '#666', fontSize: 10, marginTop: 2 },

  row:     { marginTop: 10 },
  label:   { color: '#666', fontSize: 10, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip:    {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, backgroundColor: '#2a2a4a',
    borderWidth: 1, borderColor: '#444',
  },
  chipVehicle: { backgroundColor: '#E67E22', borderColor: '#E67E22' },
  chipRadius:  { backgroundColor: '#8E44AD', borderColor: '#8E44AD' },
  chipText:        { color: '#aaa', fontSize: 11 },
  chipTextActive:  { color: '#fff', fontWeight: '600' },

  btnRow:  { flexDirection: 'row', gap: 8, marginTop: 10 },
  goBtn:   { flex: 1, backgroundColor: '#4A90D9', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  goBtnDisabled: { backgroundColor: '#2a3a5a' },
  goBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  clearBtn:      {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 10, backgroundColor: '#2a2a4a',
    borderWidth: 1, borderColor: '#444', alignItems: 'center',
  },
  clearBtnText: { color: '#888', fontSize: 14 },
});
