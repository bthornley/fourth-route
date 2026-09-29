import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, Platform,
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
  onAbout: () => void;
  onStateChange: (state: StateKey) => void;
}

export type StateKey = 'all' | 'ca' | 'wa' | 'or' | 'tx';

export const STATE_CONFIG: Record<StateKey, {
  label: string;
  bbox: string;           // west,south,east,north for Nominatim
  center: { lng: number; lat: number; zoom: number };
  flag: string;
}> = {
  all: { label: 'All',  flag: '🌎', bbox: '-124.8,25.8,-93.5,49.0',   center: { lng: -110.0, lat: 39.0, zoom: 5 } },
  ca:  { label: 'CA',   flag: '🌅', bbox: '-124.5,32.5,-114.1,42.0',   center: { lng: -119.4, lat: 36.7, zoom: 6 } },
  wa:  { label: 'WA',   flag: '⚖️', bbox: '-124.8,45.5,-116.9,49.0',   center: { lng: -120.5, lat: 47.5, zoom: 7 } },
  or:  { label: 'OR',   flag: '🏛️', bbox: '-124.6,41.9,-116.5,46.3',   center: { lng: -120.6, lat: 43.8, zoom: 7 } },
  tx:  { label: 'TX',   flag: '🤠', bbox: '-106.7,25.8,-93.5,36.5',    center: { lng: -99.0,  lat: 31.0, zoom: 6 } },
};

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

// ── Nominatim autocomplete ─────────────────────────────────────────────────
function useGeocoder(query: string, bbox: string): GeoResult[] {
  const [results, setResults] = useState<GeoResult[]>([]);
  const timer = useRef<any>(null);
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=us&addressdetails=1&viewbox=${bbox}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'fourth-route/1.0 (+https://fourthroute.app)' } });
        setResults(await res.json());
      } catch { setResults([]); }
    }, 380);
    return () => clearTimeout(timer.current);
  }, [query, bbox]);
  return results;
}

function shortLabel(r: GeoResult): string {
  const a = r.address ?? {};
  const parts = [
    a.neighbourhood || a.suburb || a.quarter || a.district || a.town || a.village,
    a.city || a.county,
    a.state,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : r.display_name.split(',').slice(0, 2).join(',').trim();
}

// ── Search input with dropdown ─────────────────────────────────────────────
function LocationInput({
  placeholder, color, value, onChange, onSelect, zIndex, bbox,
}: {
  placeholder: string; color: string; value: string;
  onChange: (v: string) => void; onSelect: (r: GeoResult) => void; zIndex: number;
  bbox: string;
}) {
  const [focused, setFocused] = useState(false);
  const results = useGeocoder(value, bbox);
  const showDrop = focused && results.length > 0;

  return (
    <View style={{ position: 'relative' as any, zIndex }}>
      <View style={[styles.inputWrapper, focused && { borderColor: color }]}>
        <Text style={[styles.dot, { color }]}>●</Text>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#777"
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
export function SearchPanel({ onRoute, onClear, loading, onAbout, onStateChange }: Props) {
  const [selectedState, setSelectedState] = useState<StateKey>('ca');
  const [originQ, setOriginQ] = useState('');
  const [destQ,   setDestQ]   = useState('');
  const [origin,  setOrigin]  = useState<GeoResult | null>(null);
  const [dest,    setDest]    = useState<GeoResult | null>(null);
  const [radiusM, setRadiusM] = useState(120);
  const [vehicle, setVehicle] = useState<VehicleType>('gas_avg');
  const [showOpts, setShowOpts] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const bbox = STATE_CONFIG[selectedState].bbox;
  const handleStateSelect = (s: StateKey) => {
    setSelectedState(s);
    onStateChange(s);
  };

  const canRoute = !!(origin && dest);

  const handleGo = () => {
    if (!canRoute) return;
    onRoute(
      parseFloat(origin!.lat), parseFloat(origin!.lon),
      parseFloat(dest!.lat),   parseFloat(dest!.lon),
      radiusM, vehicle,
    );
    setCollapsed(true); // shrink panel so map is visible
  };

  const handleClear = () => {
    setOriginQ(''); setDestQ('');
    setOrigin(null); setDest(null);
    setCollapsed(false); setShowOpts(false);
    onClear();
  };

  // ── Collapsed summary bar ──
  if (collapsed) {
    return (
      <View style={styles.collapsedBar}>
        <Text style={styles.collapsedText} numberOfLines={1}>
          {shortLabel(origin!)} → {shortLabel(dest!)}
        </Text>
        <TouchableOpacity onPress={handleClear} style={styles.collapsedClear}>
          <Text style={styles.collapsedClearText}>✕ Clear</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Full panel ──
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onAbout} activeOpacity={0.7}>
        <Text style={styles.title}>⚖️ Fourth Route</Text>
      </TouchableOpacity>
      <Text style={styles.tagline}>Navigate within your 4th Amendment rights</Text>

      {/* State selector chips */}
      <View style={styles.stateRow}>
        {(Object.keys(STATE_CONFIG) as StateKey[]).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.stateChip, selectedState === s && styles.stateChipActive]}
            onPress={() => handleStateSelect(s)}
          >
            <Text style={[styles.stateChipText, selectedState === s && styles.stateChipTextActive]}>
              {STATE_CONFIG[s].flag} {STATE_CONFIG[s].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.divider} />

      <LocationInput
        placeholder="From — any address or place"
        color="#4A90D9"
        value={originQ}
        onChange={(v) => { setOriginQ(v); if (!v) setOrigin(null); }}
        onSelect={setOrigin}
        zIndex={20}
        bbox={bbox}
      />
      <View style={{ height: 6, zIndex: 1 }} />
      <LocationInput
        placeholder="To — any address or place"
        color="#27AE60"
        value={destQ}
        onChange={(v) => { setDestQ(v); if (!v) setDest(null); }}
        onSelect={setDest}
        zIndex={19}
        bbox={bbox}
      />

      {/* Options toggle */}
      <TouchableOpacity
        style={styles.optsToggle}
        onPress={() => setShowOpts(v => !v)}
      >
        <Text style={styles.optsToggleText}>
          {showOpts ? '▲ Hide options' : `⚙ ${VEHICLE_PROFILES[vehicle].emoji} ${VEHICLE_PROFILES[vehicle].label} · ${radiusM}m radius`}
        </Text>
      </TouchableOpacity>

      {showOpts && (
        <View style={{ zIndex: 1 }}>
          <View style={styles.row}>
            <Text style={styles.label}>Vehicle</Text>
            <View style={styles.chipRow}>
              {(Object.entries(VEHICLE_PROFILES) as [VehicleType, any][]).map(([key, p]) => (
                <TouchableOpacity key={key} style={[styles.chip, vehicle === key && styles.chipVehicle]} onPress={() => setVehicle(key)}>
                  <Text style={[styles.chipText, vehicle === key && styles.chipTextOn]}>{p.emoji} {p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Exclusion radius</Text>
            <View style={styles.chipRow}>
              {[20, 40, 80, 120].map(r => (
                <TouchableOpacity key={r} style={[styles.chip, radiusM === r && styles.chipRadius]} onPress={() => setRadiusM(r)}>
                  <Text style={[styles.chipText, radiusM === r && styles.chipTextOn]}>{r}m</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.goBtn, !canRoute && styles.goBtnOff]}
          onPress={handleGo}
          disabled={loading || !canRoute}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.goBtnText}>{canRoute ? 'Route →' : 'Pick origin & destination'}</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2eee' as any,
    borderRadius: 16, padding: 12, margin: 10,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  title:    { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 4, letterSpacing: 0.3 },
  tagline:  { color: '#E8C97A', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 6, letterSpacing: 0.2 },
  stateRow: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginBottom: 8 },
  stateChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#2a2a4a', backgroundColor: '#111127' },
  stateChipActive: { borderColor: '#E8C97A', backgroundColor: '#E8C97A22' },
  stateChipText: { color: '#555', fontSize: 10, fontWeight: '500' },
  stateChipTextActive: { color: '#E8C97A', fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 11, textAlign: 'center', marginBottom: 10 },
  divider:     { height: 1, backgroundColor: '#2a2a4a', marginBottom: 6 },
  syncStatus:  { color: '#444', fontSize: 10, textAlign: 'center', marginBottom: 8, letterSpacing: 0.2 },


  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#11112a', borderRadius: 10,
    borderWidth: 1.5, borderColor: '#333',
    paddingHorizontal: 10,
  },
  dot:    { fontSize: 9, marginRight: 8 },
  input:  { flex: 1, color: '#fff', fontSize: 13, paddingVertical: 9, outlineStyle: 'none' } as any,
  clearX: { color: '#555', fontSize: 12, paddingLeft: 6 },

  dropdown: {
    position: 'absolute' as any, top: '100%', left: 0, right: 0,
    backgroundColor: '#1e1e3a', borderRadius: 10,
    borderWidth: 1, borderColor: '#333', marginTop: 3,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, elevation: 20,
  },
  dropItem:    { paddingHorizontal: 12, paddingVertical: 8 },
  dropDivider: { borderBottomWidth: 1, borderBottomColor: '#2a2a4a' },
  dropMain:    { color: '#eee', fontSize: 13, fontWeight: '500' },
  dropSub:     { color: '#555', fontSize: 10, marginTop: 2 },

  optsToggle:     { alignItems: 'center', paddingVertical: 6 },
  optsToggleText: { color: '#555', fontSize: 11 },

  row:     { marginBottom: 8 },
  label:   { color: '#555', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#2a2a4a', borderWidth: 1, borderColor: '#444' },
  chipVehicle: { backgroundColor: '#E67E22', borderColor: '#E67E22' },
  chipRadius:  { backgroundColor: '#8E44AD', borderColor: '#8E44AD' },
  chipText:    { color: '#888', fontSize: 11 },
  chipTextOn:  { color: '#fff', fontWeight: '600' },

  btnRow: { marginTop: 8 },
  goBtn:  { backgroundColor: '#4A90D9', paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  goBtnOff:  { backgroundColor: '#2a3a5a' },
  goBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Collapsed state
  collapsedBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a2ecc' as any,
    borderRadius: 12, margin: 10, padding: 10,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  collapsedText:      { flex: 1, color: '#ccc', fontSize: 12 },
  collapsedClear:     { paddingLeft: 10 },
  collapsedClearText: { color: '#4A90D9', fontSize: 12, fontWeight: '600' },
});
