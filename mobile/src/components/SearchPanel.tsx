import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
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

// Named locations for quick testing
const PRESETS: Record<string, [number, number]> = {
  // SF
  'Civic Center':   [37.7792, -122.4191],
  'Mission':        [37.7599, -122.4148],
  'Financial Dist': [37.7944, -122.3997],
  'Sunset':         [37.7558, -122.4869],
  'Nob Hill':       [37.7930, -122.4160],
  'SoMa':           [37.7785, -122.3948],
  'Castro':         [37.7609, -122.4350],
  'Haight':         [37.7694, -122.4469],
  // East Bay
  'Oakland DT':     [37.8044, -122.2712],
  'Piedmont':       [37.8244, -122.2298],
  'Berkeley DT':    [37.8716, -122.2727],
  'Fruitvale':      [37.7751, -122.2241],
  'Temescal':       [37.8278, -122.2636],
};

export function SearchPanel({ onRoute, onClear, loading }: Props) {
  const [originKey, setOriginKey] = useState<string>('Temescal');
  const [destKey, setDestKey]     = useState<string>('Fruitvale');
  const [radiusM, setRadiusM]     = useState(120);
  const [vehicle, setVehicle]     = useState<VehicleType>('gas_avg');

  const handleGo = () => {
    const [oLat, oLon] = PRESETS[originKey] ?? PRESETS['Civic Center'];
    const [dLat, dLon] = PRESETS[destKey]   ?? PRESETS['Mission'];
    onRoute(oLat, oLon, dLat, dLon, radiusM, vehicle);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚖️ Fourth Route</Text>
      <Text style={styles.subtitle}>Navigate around ALPR surveillance</Text>

      {/* Origin */}
      <View style={styles.row}>
        <Text style={styles.label}>From</Text>
        <View style={styles.pickerRow}>
          {Object.keys(PRESETS).map(k => (
            <TouchableOpacity
              key={k}
              style={[styles.chip, originKey === k && styles.chipActive]}
              onPress={() => setOriginKey(k)}
            >
              <Text style={[styles.chipText, originKey === k && styles.chipTextActive]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Destination */}
      <View style={styles.row}>
        <Text style={styles.label}>To</Text>
        <View style={styles.pickerRow}>
          {Object.keys(PRESETS).map(k => (
            <TouchableOpacity
              key={k}
              style={[styles.chip, destKey === k && styles.chipDest]}
              onPress={() => setDestKey(k)}
            >
              <Text style={[styles.chipText, destKey === k && styles.chipTextActive]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Vehicle type */}
      <View style={styles.row}>
        <Text style={styles.label}>Vehicle</Text>
        <View style={styles.pickerRow}>
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
      <View style={styles.sliderRow}>
        <Text style={styles.label}>Exclusion radius</Text>
        <View style={styles.radiusBtns}>
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
        <TouchableOpacity style={styles.goBtn} onPress={handleGo} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.goBtnText}>Route →</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearBtn} onPress={onClear}>
          <Text style={styles.clearBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e', borderRadius: 16,
    padding: 14, margin: 10,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  title: {
    color: '#fff', fontSize: 16, fontWeight: '700',
    marginBottom: 2, textAlign: 'center', letterSpacing: 0.5,
  },
  subtitle: {
    color: '#666', fontSize: 11, textAlign: 'center',
    marginBottom: 10, letterSpacing: 0.3,
  },
  row: { marginBottom: 8 },
  label: {
    color: '#888', fontSize: 11, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, backgroundColor: '#2a2a4a',
    borderWidth: 1, borderColor: '#444',
  },
  chipActive:  { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  chipDest:    { backgroundColor: '#27AE60', borderColor: '#27AE60' },
  chipRadius:  { backgroundColor: '#8E44AD', borderColor: '#8E44AD' },
  chipVehicle: { backgroundColor: '#E67E22', borderColor: '#E67E22' },
  chipText:       { color: '#aaa', fontSize: 11 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  sliderRow: { marginBottom: 10 },
  radiusBtns: { flexDirection: 'row', gap: 6 },
  btnRow: { flexDirection: 'row', gap: 8 },
  goBtn: {
    flex: 1, backgroundColor: '#4A90D9',
    paddingVertical: 10, borderRadius: 10, alignItems: 'center',
  },
  goBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  clearBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 10, backgroundColor: '#2a2a4a',
    borderWidth: 1, borderColor: '#444', alignItems: 'center',
  },
  clearBtnText: { color: '#888', fontSize: 14 },
});
