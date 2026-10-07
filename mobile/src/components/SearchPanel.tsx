import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, Platform,
} from 'react-native';
import { track } from '@vercel/analytics';
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
  hasRoute?: boolean;
}

export type StateKey = 'all' | 'ca' | 'nv' | 'wa' | 'or' | 'tx';

export const STATE_CONFIG: Record<StateKey, {
  label: string;
  bbox: string;           // west,south,east,north for Nominatim
  center: { lng: number; lat: number; zoom: number };
  flag: string;
}> = {
  all: { label: 'All',  flag: '🌎', bbox: '-124.8,25.8,-93.5,49.0',   center: { lng: -110.0, lat: 39.0, zoom: 5 } },
  ca:  { label: 'CA',   flag: '🌅', bbox: '-124.5,32.5,-114.1,42.0',   center: { lng: -119.4, lat: 36.7, zoom: 6 } },
  nv:  { label: 'NV',   flag: '🎰', bbox: '-120.0,35.0,-114.0,42.0',   center: { lng: -115.17, lat: 36.13, zoom: 11 } },
  wa:  { label: 'WA',   flag: '⚖️', bbox: '-124.8,45.5,-116.9,49.0',   center: { lng: -120.5, lat: 47.5, zoom: 7 } },
  or:  { label: 'OR',   flag: '🏛️', bbox: '-124.6,41.9,-116.5,46.3',   center: { lng: -120.6, lat: 43.8, zoom: 7 } },
  tx:  { label: 'TX',   flag: '🤠', bbox: '-106.7,25.8,-93.5,36.5',    center: { lng: -99.0,  lat: 31.0, zoom: 6 } },
};

export interface DemoRoute {
  id: string;
  label: string;
  badge: string;
  originQ: string;
  destQ: string;
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
}

export const DEMO_ROUTES: DemoRoute[] = [
  {
    id: 'oakland-fruitvale',
    label: 'Oakland → Fruitvale',
    badge: '🛡️ 303 avoided',
    originQ: 'Downtown Oakland, CA',
    destQ: 'Fruitvale, Oakland, CA',
    originLat: 37.8044,
    originLon: -122.2711,
    destLat: 37.7749,
    destLon: -122.2241,
  },
  {
    id: 'dtla-santa-monica',
    label: 'DTLA → Santa Monica',
    badge: '🛡️ 652 avoided',
    originQ: 'Downtown Los Angeles, CA',
    destQ: 'Santa Monica, CA',
    originLat: 34.0522,
    originLon: -118.2437,
    destLat: 34.0195,
    destLon: -118.4912,
  },
  {
    id: 'irvine-newport',
    label: 'Irvine → Newport Beach',
    badge: '🛡️ 429 avoided',
    originQ: 'Irvine, CA',
    destQ: 'Newport Beach, CA',
    originLat: 33.6846,
    originLon: -117.8265,
    destLat: 33.6189,
    destLon: -117.9298,
  },
  {
    id: 'vegas-strip-fremont',
    label: 'Vegas Strip → Fremont',
    badge: '🛡️ Avoid Cameras',
    originQ: 'Las Vegas Strip, NV',
    destQ: 'Fremont Street, Las Vegas, NV',
    originLat: 36.1147,
    originLon: -115.1728,
    destLat: 36.1699,
    destLon: -115.1438,
  },
];

interface GeoResult {
  place_id?: number | string;
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

const US_STATE_ABBR: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
  'District of Columbia': 'DC',
};

export function formatPlace(r?: GeoResult | null): { main: string; secondary: string; full: string } {
  if (!r) return { main: '', secondary: '', full: '' };
  const a = r.address ?? {};
  const state = a.state ? (US_STATE_ABBR[a.state] || a.state) : '';
  const city = a.city || a.town || a.village || a.municipality || a.suburb || a.hamlet || '';
  const rawName = (r.name || '').trim();

  let main = '';
  let secondary = '';

  // 1. Street Address with house number (e.g. "123 Main St")
  if (a.house_number && a.road) {
    const streetAddr = `${a.house_number} ${a.road}`;
    if (rawName && rawName !== a.house_number && rawName !== a.road && rawName !== streetAddr) {
      main = rawName;
      const cityState = [city, state].filter(Boolean).join(', ');
      const secLoc = cityState ? (a.postcode ? `${cityState} ${a.postcode}` : cityState) : (a.postcode || '');
      secondary = [streetAddr, secLoc].filter(Boolean).join(', ');
    } else {
      main = streetAddr;
      const cityArea = city || a.quarter || a.neighbourhood || '';
      const cityState = [cityArea, state].filter(Boolean).join(', ');
      secondary = cityState ? (a.postcode ? `${cityState} ${a.postcode}` : cityState) : (a.postcode || '');
    }
  }
  // 2. Named POI / venue / airport / park (e.g. "Oakland International Airport")
  else if (rawName && rawName !== city && rawName !== state) {
    main = rawName;
    const secParts = [a.road, city || a.county, state].filter(Boolean);
    secondary = secParts.join(', ');
  }
  // 3. Just a road / highway (e.g. "Broadway", "I-80")
  else if (a.road) {
    main = a.road;
    const secParts = [city || a.county, state].filter(Boolean);
    secondary = secParts.join(', ');
  }
  // 4. Neighborhood / Suburb / Quarter
  else if (a.neighbourhood || a.suburb || a.quarter || a.district) {
    main = (a.neighbourhood || a.suburb || a.quarter || a.district)!;
    const secParts = [city || a.county, state].filter(Boolean);
    secondary = secParts.join(', ');
  }
  // 5. City / Town
  else if (city) {
    main = city;
    const secParts = [a.county, state].filter(Boolean);
    secondary = secParts.join(', ');
  }
  // 6. Fallback from display_name
  else {
    const parts = (r.display_name || '').split(',').map(s => s.trim());
    main = parts[0] || 'Unknown location';
    secondary = parts.slice(1, 3).join(', ');
  }

  const full = secondary ? `${main}, ${secondary}` : main;
  return { main, secondary, full };
}

function shortLabel(r?: GeoResult | null): string {
  if (!r) return '';
  const { main, secondary } = formatPlace(r);
  if (secondary) {
    const firstSec = secondary.split(',')[0].trim();
    if (firstSec && firstSec !== main) {
      return `${main}, ${firstSec}`;
    }
  }
  return main;
}

// ── Nominatim autocomplete with race-condition cancellation & faster debounce ──
function useGeocoder(query: string, bbox: string): { results: GeoResult[]; loading: boolean } {
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<any>(null);
  const abortCtrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      if (abortCtrl.current) abortCtrl.current.abort();
      setResults([]);
      setLoading(false);
      return;
    }

    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (abortCtrl.current) abortCtrl.current.abort();
      const ctrl = new AbortController();
      abortCtrl.current = ctrl;
      setLoading(true);

      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=us&addressdetails=1&dedupe=1&viewbox=${bbox}`;
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'fourth-route/1.0 (+https://fourthroute.org)' },
        });
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setResults([]);
        }
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer.current);
    };
  }, [query, bbox]);

  return { results, loading };
}

// ── Search input with dropdown ─────────────────────────────────────────────
function LocationInput({
  placeholder, color, value, onChange, onSelect, onClearInput, zIndex, bbox, rightAction,
}: {
  placeholder: string; color: string; value: string;
  onChange: (v: string) => void; onSelect: (r: GeoResult) => void; onClearInput?: () => void; zIndex: number;
  bbox: string; rightAction?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const { results, loading } = useGeocoder(value, bbox);
  const showDrop = focused && results.length > 0;

  return (
    <View style={{ position: 'relative' as any, zIndex }}>
      <View style={[styles.inputWrapper, focused && { borderColor: color }]}>
        <Text style={[styles.dot, { color }]}>●</Text>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#888"
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
        />
        {loading && (
          <ActivityIndicator size="small" color="#E8C97A" style={{ marginRight: 6 }} />
        )}
        {value.length === 0 && rightAction}
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              onChange('');
              setFocused(false);
              onClearInput?.();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.clearX}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      {showDrop && (
        <View style={styles.dropdown}>
          {results.map((r, i) => {
            const formatted = formatPlace(r);
            return (
              <TouchableOpacity
                key={r.place_id ? String(r.place_id) : String(i)}
                style={[styles.dropItem, i < results.length - 1 && styles.dropDivider]}
                onPress={() => {
                  onSelect(r);
                  onChange(formatted.full);
                  setFocused(false);
                }}
              >
                <View style={styles.dropRow}>
                  <Text style={styles.dropPin}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropMain} numberOfLines={1}>{formatted.main}</Text>
                    {!!formatted.secondary && (
                      <Text style={styles.dropSub} numberOfLines={1}>{formatted.secondary}</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────
export function SearchPanel({ onRoute, onClear, loading, onAbout, onStateChange, hasRoute }: Props) {
  const [selectedState, setSelectedState] = useState<StateKey>('ca');
  const [originQ, setOriginQ] = useState('');
  const [destQ,   setDestQ]   = useState('');
  const [origin,  setOrigin]  = useState<GeoResult | null>(null);
  const [dest,    setDest]    = useState<GeoResult | null>(null);
  const [radiusM, setRadiusM] = useState(120);
  const [vehicle, setVehicle] = useState<VehicleType>('gas_avg');
  const [showOpts, setShowOpts] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const handleUseCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocError('Geolocation is not supported by your browser');
      setTimeout(() => setLocError(null), 4000);
      return;
    }
    setLocLoading(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let placeName = 'Current Location';
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
            { headers: { 'User-Agent': 'fourth-route/1.0 (+https://fourthroute.org)' } }
          );
          if (res.ok) {
            const data = await res.json();
            const fp = formatPlace(data);
            placeName = fp.main || fp.full || 'Current Location';
          }
        } catch {
          // reverse geocoding fallback
        }

        setOriginQ(placeName);
        setOrigin({
          display_name: placeName,
          lat: String(latitude),
          lon: String(longitude),
        });
        setLocLoading(false);
        try {
          track('use_current_location_success', { lat: latitude, lon: longitude });
        } catch {}
      },
      (err) => {
        setLocLoading(false);
        let msg = 'Could not get location';
        if (err.code === 1) msg = 'Location permission denied. Please allow access in browser.';
        else if (err.code === 2) msg = 'Location unavailable';
        else if (err.code === 3) msg = 'Location request timed out';
        setLocError(msg);
        setTimeout(() => setLocError(null), 5000);
        try {
          track('use_current_location_error', { code: err.code, message: err.message });
        } catch {}
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const bbox = STATE_CONFIG[selectedState].bbox;
  const handleStateSelect = (s: StateKey) => {
    setSelectedState(s);
    onStateChange(s);
    try {
      track('state_selected', { state: s });
    } catch {}
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

  const handleDemoSelect = (demo: DemoRoute) => {
    setOriginQ(demo.originQ);
    setDestQ(demo.destQ);
    setOrigin({
      display_name: demo.originQ,
      lat: String(demo.originLat),
      lon: String(demo.originLon),
    });
    setDest({
      display_name: demo.destQ,
      lat: String(demo.destLat),
      lon: String(demo.destLon),
    });
    if (selectedState !== 'ca') {
      handleStateSelect('ca');
    }
    onRoute(
      demo.originLat, demo.originLon,
      demo.destLat, demo.destLon,
      radiusM, vehicle,
    );
    setCollapsed(true);
    try {
      track('demo_route_selected', { route: demo.id, label: demo.label });
    } catch {}
  };

  const handleClear = () => {
    setOriginQ('');
    setDestQ('');
    setOrigin(null);
    setDest(null);
    setCollapsed(false);
    setShowOpts(false);
    onClear();
  };

  // ── Collapsed summary bar ──
  if (collapsed) {
    return (
      <View style={styles.collapsedBar}>
        <Text style={styles.collapsedText} numberOfLines={1}>
          {shortLabel(origin)} → {shortLabel(dest)}
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

      {/* Region routing availability notice */}
      {selectedState !== 'ca' && selectedState !== 'nv' && (
        <View style={styles.stateNotice}>
          <Text style={styles.stateNoticeText}>
            ℹ️ Camera data is live · Privacy routing is currently enabled in California & Nevada
          </Text>
        </View>
      )}

      <View style={styles.divider} />

      <LocationInput
        placeholder="From — any address or place"
        color="#4A90D9"
        value={originQ}
        onChange={(v) => {
          setOriginQ(v);
          if (!v) {
            setOrigin(null);
            if (hasRoute) onClear();
          }
        }}
        onSelect={setOrigin}
        onClearInput={() => {
          setOrigin(null);
          if (hasRoute) onClear();
        }}
        zIndex={20}
        bbox={bbox}
        rightAction={
          <TouchableOpacity
            style={styles.gpsBtnInline}
            onPress={handleUseCurrentLocation}
            disabled={locLoading}
            activeOpacity={0.7}
          >
            {locLoading ? (
              <ActivityIndicator size="small" color="#4A90D9" />
            ) : (
              <Text style={styles.gpsBtnInlineText}>📍 Current</Text>
            )}
          </TouchableOpacity>
        }
      />
      <View style={{ height: 6, zIndex: 1 }} />
      <LocationInput
        placeholder="To — any address or place"
        color="#27AE60"
        value={destQ}
        onChange={(v) => {
          setDestQ(v);
          if (!v) {
            setDest(null);
            if (hasRoute) onClear();
          }
        }}
        onSelect={setDest}
        onClearInput={() => {
          setDest(null);
          if (hasRoute) onClear();
        }}
        zIndex={19}
        bbox={bbox}
      />

      {/* 1-Tap Use My Current Location Pill */}
      {!origin && !hasRoute && (
        <TouchableOpacity
          style={styles.currentLocPill}
          onPress={handleUseCurrentLocation}
          disabled={locLoading}
          activeOpacity={0.7}
        >
          {locLoading ? (
            <ActivityIndicator size="small" color="#4A90D9" />
          ) : (
            <>
              <Text style={styles.currentLocPillIcon}>📍</Text>
              <Text style={styles.currentLocPillText}>Use My Current Location as Start</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {locError && (
        <View style={styles.locErrorBox}>
          <Text style={styles.locErrorText}>⚠️ {locError}</Text>
        </View>
      )}

      {/* 1-Click Demo Commute Routes */}
      {!origin && !dest && !hasRoute && (
        <View style={styles.demoContainer}>
          <View style={styles.demoHeader}>
            <Text style={styles.demoTitle}>⚡ 1-Click Demo Commutes</Text>
            <Text style={styles.demoSubtitle}>Tap to test live routing</Text>
          </View>
          <View style={styles.demoRow}>
            {DEMO_ROUTES.map(demo => (
              <TouchableOpacity
                key={demo.id}
                style={styles.demoChip}
                onPress={() => handleDemoSelect(demo)}
                activeOpacity={0.7}
              >
                <Text style={styles.demoChipLabel} numberOfLines={1}>{demo.label}</Text>
                <Text style={styles.demoChipBadge}>{demo.badge}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Options toggle */}
      <TouchableOpacity
        style={styles.optsToggle}
        onPress={() => setShowOpts(v => !v)}
        activeOpacity={0.7}
      >
        <Text style={styles.optsToggleText}>
          {showOpts ? '▲ Hide vehicle & radius' : `⚙️ ${VEHICLE_PROFILES[vehicle].emoji} ${VEHICLE_PROFILES[vehicle].label} · ${radiusM}m radius`}
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
          style={[styles.goBtn, !canRoute && styles.goBtnOff, hasRoute && { flex: 1, marginRight: 8 }]}
          onPress={handleGo}
          disabled={loading || !canRoute}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.goBtnText}>{canRoute ? 'Route →' : 'Pick origin & destination'}</Text>
          }
        </TouchableOpacity>
        {hasRoute && (
          <TouchableOpacity
            style={styles.clearRouteBtn}
            onPress={handleClear}
          >
            <Text style={styles.clearRouteBtnText}>✕ Clear Route</Text>
          </TouchableOpacity>
        )}
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
  stateNotice: {
    backgroundColor: '#111127',
    borderWidth: 1,
    borderColor: '#2a2a4a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    alignItems: 'center',
  },
  stateNoticeText: { color: '#aaa', fontSize: 11, textAlign: 'center', lineHeight: 15 },
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
  gpsBtnInline: {
    backgroundColor: '#1b2a4a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2e4978',
    marginLeft: 6,
  },
  gpsBtnInlineText: {
    color: '#70A5F9',
    fontSize: 11,
    fontWeight: '700',
  },
  currentLocPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1b2a4a',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#2f4b7c',
    gap: 6,
  },
  currentLocPillIcon: {
    fontSize: 13,
  },
  currentLocPillText: {
    color: '#70A5F9',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  locErrorBox: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#3d1a1a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#7a2e2e',
  },
  locErrorText: {
    color: '#ff8888',
    fontSize: 11,
    textAlign: 'center',
  },

  dropdown: {
    position: 'absolute' as any, top: '100%', left: 0, right: 0,
    backgroundColor: '#181832', borderRadius: 10,
    borderWidth: 1, borderColor: '#333355', marginTop: 4,
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 12, elevation: 20,
    overflow: 'hidden' as any,
  },
  dropItem:    { paddingHorizontal: 12, paddingVertical: 9 },
  dropDivider: { borderBottomWidth: 1, borderBottomColor: '#252544' },
  dropRow:     { flexDirection: 'row', alignItems: 'center' },
  dropPin:     { fontSize: 13, marginRight: 8, opacity: 0.8 },
  dropMain:    { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  dropSub:     { color: '#a0a0c0', fontSize: 11, marginTop: 2 },

  optsToggle:     { alignSelf: 'center', paddingVertical: 5, paddingHorizontal: 12, marginVertical: 4, borderRadius: 8, backgroundColor: '#111127', borderWidth: 1, borderColor: '#2a2a4a' },
  optsToggleText: { color: '#E8C97A', fontSize: 11.5, fontWeight: '600' },

  row:     { marginBottom: 8, marginTop: 4 },
  label:   { color: '#bbb', fontSize: 10.5, fontWeight: '700', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:    { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: '#13132a', borderWidth: 1, borderColor: '#333355' },
  chipVehicle: { backgroundColor: '#E67E22', borderColor: '#E67E22' },
  chipRadius:  { backgroundColor: '#8E44AD', borderColor: '#8E44AD' },
  chipText:    { color: '#aaa', fontSize: 11, fontWeight: '500' },
  chipTextOn:  { color: '#fff', fontWeight: '700' },

  btnRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center' },
  goBtn:  { backgroundColor: '#4A90D9', paddingVertical: 11, borderRadius: 10, alignItems: 'center', flex: 1 },
  goBtnOff:  { backgroundColor: '#2a3a5a' },
  goBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  clearRouteBtn: {
    backgroundColor: '#252545',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3d3d65',
  },
  clearRouteBtnText: {
    color: '#E8C97A',
    fontWeight: '600',
    fontSize: 13,
  },

  // 1-Click Demo Commutes
  demoContainer: {
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#121226',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#252545',
  },
  demoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  demoTitle: {
    color: '#E8C97A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  demoSubtitle: {
    color: '#777',
    fontSize: 10,
  },
  demoRow: {
    flexDirection: 'row',
    gap: 6,
  },
  demoChip: {
    flex: 1,
    backgroundColor: '#1a1a36',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333355',
  },
  demoChipLabel: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  demoChipBadge: {
    color: '#2ECC71',
    fontSize: 9.5,
    fontWeight: '700',
    textAlign: 'center',
  },

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
