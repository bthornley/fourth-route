import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, Platform, ScrollView,
} from 'react-native';
import { track } from '@vercel/analytics';
import { VehicleType, VEHICLE_PROFILES } from '../services/fuel';
import { geocodeSearch, reverseGeocode } from '../services/api';

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
  collapsed?: boolean;
  onToggleCollapsed?: (collapsed: boolean) => void;
}

export type StateKey =
  | 'all' | 'al' | 'ak' | 'az' | 'ar' | 'ca' | 'co' | 'ct' | 'de' | 'dc'
  | 'fl' | 'ga' | 'hi' | 'id' | 'il' | 'in' | 'ia' | 'ks' | 'ky' | 'la'
  | 'me' | 'md' | 'ma' | 'mi' | 'mn' | 'ms' | 'mo' | 'mt' | 'ne' | 'nv'
  | 'nh' | 'nj' | 'nm' | 'ny' | 'nc' | 'nd' | 'oh' | 'ok' | 'or' | 'pa'
  | 'ri' | 'sc' | 'sd' | 'tn' | 'tx' | 'ut' | 'vt' | 'va' | 'wa' | 'wv'
  | 'wi' | 'wy';

export const STATE_CONFIG: Record<StateKey, {
  label: string;
  name: string;
  bbox: string;           // west,south,east,north for Nominatim
  center: { lng: number; lat: number; zoom: number };
  flag: string;
}> = {
  all: { label: 'All', name: 'United States', flag: '🌎', bbox: '-125.0,24.0,-66.5,50.0', center: { lng: -98.5, lat: 39.5, zoom: 4.2 } },
  al: { label: 'AL', name: 'Alabama', flag: '🌲', bbox: '-88.47,30.22,-84.89,35.01', center: { lng: -86.90, lat: 32.31, zoom: 7.0 } },
  ak: { label: 'AK', name: 'Alaska', flag: '❄️', bbox: '-179.15,51.21,-129.98,71.39', center: { lng: -152.40, lat: 64.20, zoom: 4.5 } },
  az: { label: 'AZ', name: 'Arizona', flag: '🌵', bbox: '-114.81,31.33,-109.04,37.00', center: { lng: -112.07, lat: 33.45, zoom: 8.0 } },
  ar: { label: 'AR', name: 'Arkansas', flag: '💎', bbox: '-94.62,33.00,-89.64,36.50', center: { lng: -92.29, lat: 34.75, zoom: 7.5 } },
  ca: { label: 'CA', name: 'California', flag: '🌅', bbox: '-124.48,32.53,-114.13,42.01', center: { lng: -119.42, lat: 36.78, zoom: 6.2 } },
  co: { label: 'CO', name: 'Colorado', flag: '🏔️', bbox: '-109.06,36.99,-102.04,41.00', center: { lng: -104.99, lat: 39.74, zoom: 7.5 } },
  ct: { label: 'CT', name: 'Connecticut', flag: '⚓', bbox: '-73.73,40.98,-71.79,42.05', center: { lng: -72.68, lat: 41.60, zoom: 9.0 } },
  de: { label: 'DE', name: 'Delaware', flag: '🐔', bbox: '-75.79,38.45,-75.05,39.84', center: { lng: -75.53, lat: 39.16, zoom: 9.0 } },
  dc: { label: 'DC', name: 'District of Columbia', flag: '🏛️', bbox: '-77.12,38.79,-76.91,38.99', center: { lng: -77.04, lat: 38.91, zoom: 11.5 } },
  fl: { label: 'FL', name: 'Florida', flag: '🌴', bbox: '-87.63,24.52,-80.03,31.00', center: { lng: -81.52, lat: 28.54, zoom: 7.0 } },
  ga: { label: 'GA', name: 'Georgia', flag: '🍑', bbox: '-85.61,30.36,-80.84,35.00', center: { lng: -84.39, lat: 33.75, zoom: 7.5 } },
  hi: { label: 'HI', name: 'Hawaii', flag: '🌺', bbox: '-160.25,18.91,-154.81,22.24', center: { lng: -157.86, lat: 21.31, zoom: 7.5 } },
  id: { label: 'ID', name: 'Idaho', flag: '🥔', bbox: '-117.24,41.99,-111.04,49.00', center: { lng: -116.20, lat: 43.62, zoom: 6.8 } },
  il: { label: 'IL', name: 'Illinois', flag: '🏙️', bbox: '-91.51,36.97,-87.50,42.51', center: { lng: -87.65, lat: 41.85, zoom: 7.5 } },
  in: { label: 'IN', name: 'Indiana', flag: '🏎️', bbox: '-88.10,37.77,-84.78,41.76', center: { lng: -86.16, lat: 39.77, zoom: 7.5 } },
  ia: { label: 'IA', name: 'Iowa', flag: '🌽', bbox: '-96.64,40.38,-90.14,43.50', center: { lng: -93.61, lat: 41.59, zoom: 7.5 } },
  ks: { label: 'KS', name: 'Kansas', flag: '🌻', bbox: '-102.05,36.99,-94.59,40.00', center: { lng: -96.73, lat: 38.53, zoom: 7.2 } },
  ky: { label: 'KY', name: 'Kentucky', flag: '🐎', bbox: '-89.57,36.50,-81.96,39.15', center: { lng: -84.88, lat: 38.20, zoom: 7.5 } },
  la: { label: 'LA', name: 'Louisiana', flag: '⚜️', bbox: '-94.04,28.93,-88.82,33.02', center: { lng: -91.19, lat: 30.45, zoom: 7.5 } },
  me: { label: 'ME', name: 'Maine', flag: '🦞', bbox: '-71.08,42.98,-66.95,47.46', center: { lng: -69.78, lat: 44.31, zoom: 7.0 } },
  md: { label: 'MD', name: 'Maryland', flag: '🦀', bbox: '-79.49,37.91,-75.05,39.72', center: { lng: -76.61, lat: 39.05, zoom: 8.0 } },
  ma: { label: 'MA', name: 'Massachusetts', flag: '🏛️', bbox: '-73.51,41.24,-69.93,42.89', center: { lng: -71.06, lat: 42.36, zoom: 8.5 } },
  mi: { label: 'MI', name: 'Michigan', flag: '🚗', bbox: '-90.42,41.70,-82.41,48.24', center: { lng: -84.56, lat: 42.73, zoom: 7.0 } },
  mn: { label: 'MN', name: 'Minnesota', flag: '🛶', bbox: '-97.24,43.50,-89.49,49.38', center: { lng: -93.10, lat: 44.95, zoom: 6.8 } },
  ms: { label: 'MS', name: 'Mississippi', flag: '🎸', bbox: '-91.66,30.17,-88.10,34.99', center: { lng: -90.18, lat: 32.30, zoom: 7.2 } },
  mo: { label: 'MO', name: 'Missouri', flag: '🏛️', bbox: '-95.77,35.99,-89.10,40.61', center: { lng: -92.17, lat: 38.58, zoom: 7.2 } },
  mt: { label: 'MT', name: 'Montana', flag: '🏔️', bbox: '-116.05,44.36,-104.04,49.00', center: { lng: -112.04, lat: 46.59, zoom: 6.5 } },
  ne: { label: 'NE', name: 'Nebraska', flag: '🌾', bbox: '-104.05,40.00,-95.31,43.00', center: { lng: -96.70, lat: 40.81, zoom: 7.0 } },
  nv: { label: 'NV', name: 'Nevada', flag: '🎰', bbox: '-120.00,35.00,-114.04,42.00', center: { lng: -115.17, lat: 36.13, zoom: 7.0 } },
  nh: { label: 'NH', name: 'New Hampshire', flag: '🍁', bbox: '-72.56,42.70,-70.70,45.31', center: { lng: -71.54, lat: 43.21, zoom: 7.8 } },
  nj: { label: 'NJ', name: 'New Jersey', flag: '🏖️', bbox: '-75.56,38.93,-73.89,41.36', center: { lng: -74.41, lat: 40.06, zoom: 8.2 } },
  nm: { label: 'NM', name: 'New Mexico', flag: '☀️', bbox: '-109.05,31.33,-103.00,37.00', center: { lng: -105.94, lat: 35.69, zoom: 7.0 } },
  ny: { label: 'NY', name: 'New York', flag: '🗽', bbox: '-79.76,40.50,-71.86,45.02', center: { lng: -74.00, lat: 40.71, zoom: 7.2 } },
  nc: { label: 'NC', name: 'North Carolina', flag: '✈️', bbox: '-84.32,33.84,-75.46,36.59', center: { lng: -78.64, lat: 35.78, zoom: 7.2 } },
  nd: { label: 'ND', name: 'North Dakota', flag: '🦬', bbox: '-104.05,45.94,-96.55,49.00', center: { lng: -100.78, lat: 46.81, zoom: 6.8 } },
  oh: { label: 'OH', name: 'Ohio', flag: '🌰', bbox: '-84.82,38.40,-80.52,42.00', center: { lng: -82.99, lat: 39.96, zoom: 7.5 } },
  ok: { label: 'OK', name: 'Oklahoma', flag: '🌪️', bbox: '-103.00,33.62,-94.43,37.00', center: { lng: -97.52, lat: 35.47, zoom: 7.2 } },
  or: { label: 'OR', name: 'Oregon', flag: '🌲', bbox: '-124.57,41.99,-116.46,46.29', center: { lng: -122.68, lat: 45.52, zoom: 7.0 } },
  pa: { label: 'PA', name: 'Pennsylvania', flag: '🔔', bbox: '-80.52,39.72,-74.69,42.27', center: { lng: -76.88, lat: 40.27, zoom: 7.5 } },
  ri: { label: 'RI', name: 'Rhode Island', flag: '⛵', bbox: '-71.86,41.15,-71.12,42.02', center: { lng: -71.41, lat: 41.82, zoom: 9.5 } },
  sc: { label: 'SC', name: 'South Carolina', flag: '🌴', bbox: '-83.35,32.03,-78.54,35.22', center: { lng: -81.04, lat: 34.00, zoom: 7.8 } },
  sd: { label: 'SD', name: 'South Dakota', flag: '🗿', bbox: '-104.06,42.48,-96.44,45.95', center: { lng: -100.35, lat: 44.37, zoom: 6.8 } },
  tn: { label: 'TN', name: 'Tennessee', flag: '🎸', bbox: '-90.31,34.98,-81.65,36.68', center: { lng: -86.78, lat: 36.16, zoom: 7.2 } },
  tx: { label: 'TX', name: 'Texas', flag: '🤠', bbox: '-106.65,25.84,-93.51,36.50', center: { lng: -97.74, lat: 30.27, zoom: 6.2 } },
  ut: { label: 'UT', name: 'Utah', flag: '⛷️', bbox: '-114.05,37.00,-109.04,42.00', center: { lng: -111.89, lat: 40.76, zoom: 7.0 } },
  vt: { label: 'VT', name: 'Vermont', flag: '🍁', bbox: '-73.44,42.73,-71.50,45.02', center: { lng: -72.58, lat: 44.26, zoom: 7.8 } },
  va: { label: 'VA', name: 'Virginia', flag: '🏛️', bbox: '-83.68,36.54,-75.24,39.47', center: { lng: -77.44, lat: 37.54, zoom: 7.5 } },
  wa: { label: 'WA', name: 'Washington', flag: '🌲', bbox: '-124.85,45.54,-116.92,49.00', center: { lng: -122.33, lat: 47.61, zoom: 7.0 } },
  wv: { label: 'WV', name: 'West Virginia', flag: '⛰️', bbox: '-82.64,37.20,-77.72,40.64', center: { lng: -81.63, lat: 38.35, zoom: 7.5 } },
  wi: { label: 'WI', name: 'Wisconsin', flag: '🧀', bbox: '-92.89,42.49,-86.80,47.08', center: { lng: -89.40, lat: 43.07, zoom: 7.0 } },
  wy: { label: 'WY', name: 'Wyoming', flag: '🦬', bbox: '-111.06,40.99,-104.05,45.00', center: { lng: -104.82, lat: 41.14, zoom: 6.8 } },
};

export const FEATURED_STATES: StateKey[] = ['all', 'ca', 'nv', 'tx', 'ga', 'il', 'fl', 'oh', 'ny', 'pa', 'nj', 'va', 'nc', 'az', 'co', 'wa', 'or', 'id'];

export const ROUTING_STATES = new Set<StateKey>(['all', 'ca', 'nv', 'tx', 'ga', 'il', 'fl', 'oh', 'ny', 'pa', 'nj', 'va', 'nc', 'az', 'co', 'wa', 'or', 'id']);

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
  /** State to select on the map (defaults to 'ca'). */
  state?: StateKey;
}

// Verified against the live router on 2026-10-07 (cameras within 40 m of the route,
// fastest → privacy). Re-check with scratch/demo_candidates.py if the camera DB or router changes.
export const DEMO_ROUTES: DemoRoute[] = [
  {
    id: 'oakland-fruitvale',
    label: 'Oakland → Fruitvale',
    badge: '🛡️ 25 avoided', // 26 → 1, +2.8 min
    originQ: 'Downtown Oakland, CA',
    destQ: 'Fruitvale, Oakland, CA',
    originLat: 37.8044,
    originLon: -122.2711,
    destLat: 37.7749,
    destLon: -122.2241,
  },
  {
    id: 'pasadena-altadena',
    label: 'Pasadena → Altadena',
    badge: '🛡️ 21 avoided', // 22 → 1, 0.7 min faster
    originQ: 'Pasadena, CA',
    destQ: 'Altadena, CA',
    originLat: 34.1478,
    originLon: -118.1445,
    destLat: 34.1897,
    destLon: -118.1312,
  },
  {
    id: 'northpark-cityheights',
    label: 'North Park → City Hts',
    badge: '🛡️ 13 avoided', // 13 → 0, 0.4 min faster
    originQ: 'North Park, San Diego, CA',
    destQ: 'City Heights, San Diego, CA',
    originLat: 32.7477,
    originLon: -117.1295,
    destLat: 32.7480,
    destLon: -117.0990,
  },
  {
    id: 'vegas-strip-chinatown',
    label: 'Vegas Strip → Chinatown',
    badge: '🛡️ 8 avoided', // 8 → 0, +1.3 min
    originQ: 'Las Vegas Strip, NV',
    destQ: 'Chinatown, Las Vegas, NV',
    originLat: 36.1147,
    originLon: -115.1728,
    destLat: 36.1263,
    destLon: -115.1990,
    state: 'nv',
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

export function detectUnsupportedState(r?: GeoResult | null): string | null {
  if (!r) return null;
  const rawState = r.address?.state;
  if (rawState) {
    const abbr = (US_STATE_ABBR[rawState] || rawState).toLowerCase() as StateKey;
    if (STATE_CONFIG[abbr] && !ROUTING_STATES.has(abbr)) {
      return STATE_CONFIG[abbr].name;
    }
  }
  return null;
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
        const data = await geocodeSearch(q, bbox, ctrl.signal);
        setResults(data);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setResults([]);
        }
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
        }
      }
    }, 400); // debounce: fewer requests against the shared 1 req/s geocoding allowance

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
export function SearchPanel({
  onRoute, onClear, loading, onAbout, onStateChange, hasRoute,
  collapsed: controlledCollapsed, onToggleCollapsed,
}: Props) {
  const [selectedState, setSelectedState] = useState<StateKey>('ca');
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [stateSearchQuery, setStateSearchQuery] = useState('');
  const [originQ, setOriginQ] = useState('');
  const [destQ,   setDestQ]   = useState('');
  const [origin,  setOrigin]  = useState<GeoResult | null>(null);
  const [dest,    setDest]    = useState<GeoResult | null>(null);
  const [radiusM, setRadiusM] = useState(120);
  const [vehicle, setVehicle] = useState<VehicleType>('gas_avg');
  const [showOpts, setShowOpts] = useState(false);
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const collapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const setCollapsed = (val: boolean) => {
    onToggleCollapsed?.(val);
    setInternalCollapsed(val);
  };

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
        let revAddress: Record<string, string> | undefined = undefined;
        try {
          const data = await reverseGeocode(latitude, longitude);
          if (data) {
            revAddress = data.address;
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
          address: revAddress,
        });
        setLocLoading(false);
        try {
          // Never send coordinates to analytics.
          track('use_current_location_success');
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

  const chipsToRender = useMemo(() => {
    if (FEATURED_STATES.includes(selectedState)) return FEATURED_STATES;
    return ['all', selectedState, ...FEATURED_STATES.filter(s => s !== 'all')];
  }, [selectedState]);

  const filteredStates = useMemo(() => {
    const q = stateSearchQuery.trim().toLowerCase();
    const allKeys = (Object.keys(STATE_CONFIG) as StateKey[]).filter(k => k !== 'all');
    const sorted = [...allKeys].sort((a, b) => STATE_CONFIG[a].name.localeCompare(STATE_CONFIG[b].name));
    if (!q) return sorted;
    return sorted.filter(k => {
      const cfg = STATE_CONFIG[k];
      return cfg.label.toLowerCase().includes(q) || cfg.name.toLowerCase().includes(q);
    });
  }, [stateSearchQuery]);

  const bbox = STATE_CONFIG[selectedState]?.bbox || STATE_CONFIG.all.bbox;
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
    const demoState = demo.state ?? 'ca';
    if (selectedState !== demoState) {
      handleStateSelect(demoState);
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

  // ── Collapsed bar ──
  if (collapsed) {
    if (hasRoute || (origin && dest)) {
      return (
        <View style={styles.collapsedBar}>
          <TouchableOpacity
            style={styles.collapsedBarTouchable}
            onPress={() => setCollapsed(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.collapsedText} numberOfLines={1}>
              {shortLabel(origin)} → {shortLabel(dest)}
            </Text>
            <Text style={styles.collapsedExpandText}>Edit ▲</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClear} style={styles.collapsedClear}>
            <Text style={styles.collapsedClearText}>✕ Clear</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Browsing the map without an active route
    return (
      <TouchableOpacity
        style={styles.collapsedBrowseBar}
        onPress={() => {
          setCollapsed(false);
          try { track('expand_search_panel'); } catch {}
        }}
        activeOpacity={0.85}
      >
        <View style={styles.collapsedBrowseLeft}>
          <Text style={styles.collapsedBrowseSearchIcon}>🔍</Text>
          <Text style={styles.collapsedBrowseTitle}>Search & Plan Route</Text>
        </View>
        <View style={styles.collapsedBrowseRight}>
          <Text style={styles.collapsedBrowseBadge}>145k+ Cameras</Text>
          <Text style={styles.collapsedBrowseChevron}>▲</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Full panel ──
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onAbout} activeOpacity={0.7} style={styles.headerTitleWrap}>
          <Text style={styles.title}>⚖️ Fourth Route</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.browseMapBtn}
          onPress={() => {
            setCollapsed(true);
            try { track('browse_map_collapsed'); } catch {}
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.browseMapBtnText}>🗺️ Browse Map ▼</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.tagline}>Navigate within your 4th Amendment rights</Text>

      {/* State selector chips — single clean horizontal scroll row for mobile */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stateScrollContent}
        style={styles.stateScrollView}
      >
        {chipsToRender.map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.stateChip, selectedState === s && styles.stateChipActive]}
            onPress={() => {
              setShowStateDropdown(false);
              handleStateSelect(s);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.stateChipText, selectedState === s && styles.stateChipTextActive]}>
              {STATE_CONFIG[s]?.flag} {STATE_CONFIG[s]?.label}
            </Text>
          </TouchableOpacity>
        ))}

        {/* More States Button */}
        <TouchableOpacity
          style={[styles.stateChip, styles.moreStatesChip, showStateDropdown && styles.moreStatesChipActive]}
          onPress={() => setShowStateDropdown(prev => !prev)}
          activeOpacity={0.7}
        >
          <Text style={[styles.stateChipText, showStateDropdown && styles.stateChipTextActive]}>
            🗺️ More States {showStateDropdown ? '▴' : '▾'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 50-State Searchable Dropdown */}
      {showStateDropdown && (
        <View style={styles.dropdownModal}>
          <View style={styles.dropdownHeader}>
            <Text style={styles.dropdownTitle}>Explore All 50 States</Text>
            <TouchableOpacity onPress={() => setShowStateDropdown(false)} style={styles.dropdownCloseBtn}>
              <Text style={styles.dropdownCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.dropdownSearchWrap}>
            <TextInput
              style={styles.dropdownSearchInput}
              placeholder="Filter state (e.g. New York, CO, TN)..."
              placeholderTextColor="#666"
              value={stateSearchQuery}
              onChangeText={setStateSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <ScrollView
            style={styles.dropdownList}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {filteredStates.map(s => {
              const cfg = STATE_CONFIG[s];
              const isSel = selectedState === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.dropdownItem, isSel && styles.dropdownItemActive]}
                  onPress={() => {
                    handleStateSelect(s);
                    setShowStateDropdown(false);
                    setStateSearchQuery('');
                  }}
                  activeOpacity={0.65}
                >
                  <Text style={styles.dropdownItemFlag}>{cfg.flag}</Text>
                  <Text style={[styles.dropdownItemCode, isSel && styles.dropdownItemTextActive]}>
                    {cfg.label}
                  </Text>
                  <Text style={[styles.dropdownItemName, isSel && styles.dropdownItemTextActive]}>
                    {cfg.name}
                  </Text>
                  {isSel && <Text style={styles.dropdownItemCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
            {filteredStates.length === 0 && (
              <View style={styles.dropdownEmpty}>
                <Text style={styles.dropdownEmptyText}>No matching states found</Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* Region routing availability notice */}
      {(() => {
        const unsupportedEndpointState = detectUnsupportedState(origin) || detectUnsupportedState(dest);
        const unsupportedChipState = !ROUTING_STATES.has(selectedState) ? STATE_CONFIG[selectedState]?.name : null;
        const unlaunchedState = unsupportedEndpointState || unsupportedChipState;
        if (!unlaunchedState) return null;
        return (
          <View style={styles.stateNotice}>
            <Text style={styles.stateNoticeText}>
              ℹ️ Camera map is live in {unlaunchedState}, but privacy routing isn't launched in {unlaunchedState} yet. Active routing states: CA, NV, TX, GA, IL, FL, OH, NY, PA, NJ, VA, NC, AZ, CO, WA, OR & ID.
            </Text>
          </View>
        );
      })()}

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

      {/* Minimize / Browse Map Link */}
      <TouchableOpacity
        style={styles.bottomBrowseLink}
        onPress={() => {
          setCollapsed(true);
          try { track('browse_map_collapsed'); } catch {}
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.bottomBrowseLinkText}>🗺️ Minimize to browse map</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2eee' as any,
    borderRadius: 16, padding: 12, margin: 10,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  browseMapBtn: {
    backgroundColor: '#1b2a4a',
    borderWidth: 1,
    borderColor: '#34558b',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  browseMapBtnText: {
    color: '#70A5F9',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomBrowseLink: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  bottomBrowseLinkText: {
    color: '#70A5F9',
    fontSize: 11.5,
    fontWeight: '600',
  },
  title:    { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  tagline:  { color: '#E8C97A', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 6, letterSpacing: 0.2 },
  stateScrollView: {
    maxHeight: 34,
    marginBottom: 8,
  },
  stateScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  stateChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    backgroundColor: '#111127',
  },
  stateChipActive: {
    borderColor: '#E8C97A',
    backgroundColor: '#E8C97A22',
  },
  stateChipText: {
    color: '#777',
    fontSize: 11,
    fontWeight: '600',
  },
  stateChipTextActive: {
    color: '#E8C97A',
    fontWeight: '700',
  },
  moreStatesChip: {
    borderColor: '#383860',
    backgroundColor: '#161633',
  },
  moreStatesChipActive: {
    borderColor: '#E8C97A',
    backgroundColor: '#E8C97A22',
  },
  dropdownModal: {
    backgroundColor: '#15152a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#34345c',
    marginBottom: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 50,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#252542',
  },
  dropdownTitle: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dropdownCloseBtn: {
    padding: 4,
  },
  dropdownCloseText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownSearchWrap: {
    marginTop: 6,
    marginBottom: 6,
  },
  dropdownSearchInput: {
    backgroundColor: '#0d0d1e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2e2e54',
    color: '#fff',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    outlineStyle: 'none',
  } as any,
  dropdownList: {
    maxHeight: 180,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 8,
  },
  dropdownItemActive: {
    backgroundColor: '#E8C97A22',
  },
  dropdownItemFlag: {
    fontSize: 14,
  },
  dropdownItemCode: {
    color: '#E8C97A',
    fontWeight: '700',
    fontSize: 12,
    width: 24,
  },
  dropdownItemName: {
    color: '#cbd5e1',
    fontSize: 12,
    flex: 1,
  },
  dropdownItemTextActive: {
    color: '#E8C97A',
    fontWeight: '700',
  },
  dropdownItemCheck: {
    color: '#E8C97A',
    fontWeight: '700',
    fontSize: 12,
  },
  dropdownEmpty: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    color: '#64748b',
    fontSize: 11,
  },
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2eee' as any,
    borderRadius: 12,
    margin: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  collapsedBarTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 8,
  },
  collapsedText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  collapsedExpandText: {
    color: '#E8C97A',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 6,
  },
  collapsedClear: {
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#333355',
  },
  collapsedClearText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },

  // Floating Browse Bar when collapsed without route
  collapsedBrowseBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a2eee' as any,
    borderRadius: 12,
    margin: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: '#3a5488',
  },
  collapsedBrowseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsedBrowseSearchIcon: {
    fontSize: 14,
  },
  collapsedBrowseTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  collapsedBrowseRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsedBrowseBadge: {
    backgroundColor: '#27ae6022',
    color: '#2ecc71',
    borderColor: '#27ae6066',
    borderWidth: 1,
    borderRadius: 6,
    fontSize: 10.5,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden' as any,
  },
  collapsedBrowseChevron: {
    color: '#70A5F9',
    fontSize: 12,
    fontWeight: '800',
  },
});
