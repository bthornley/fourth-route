import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CompareResult } from '../services/api';
import {
  VehicleType, VEHICLE_PROFILES,
  calcFuelSavings, annualiseSavings,
} from '../services/fuel';

interface Props {
  result: CompareResult;
  vehicle: VehicleType;
}

function fmtTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function fmtMiles(miles: number): string {
  return `${miles.toFixed(2)} mi`;
}

function fmtDollars(n: number): string {
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(3)}`;
}

type Verdict = 'strictly_better' | 'free_win' | 'time_only' | 'real_overhead' | 'impossible';

function getVerdict(pr: CompareResult['privacy_route'], oh: CompareResult['overhead']): Verdict {
  if (!pr) return 'impossible';
  if (!oh) return 'time_only';
  const fasterOrSame  = oh.extra_seconds <= 0;
  const shorterOrSame = oh.extra_miles <= 0;
  if (fasterOrSame && shorterOrSame) return 'strictly_better';
  if (shorterOrSame && oh.extra_seconds > 0) return 'free_win';
  if (oh.extra_miles > 0.05 && oh.extra_seconds > 30) return 'real_overhead';
  return 'time_only';
}

const VERDICT_CONFIG = {
  strictly_better: { emoji: '🎯', label: 'Strictly better!',       sub: 'Privacy route is faster AND shorter.',                    color: '#27AE60' },
  free_win:        { emoji: '✨', label: 'Free win on distance',    sub: 'Privacy is shorter — freeway added unnecessary miles.',   color: '#2ECC71' },
  time_only:       { emoji: '⚖️', label: 'Minimal overhead',        sub: 'Same distance, small time difference.',                   color: '#F39C12' },
  real_overhead:   { emoji: '⏱️', label: 'Real overhead',           sub: 'Privacy routing costs extra time and distance.',          color: '#E74C3C' },
  impossible:      { emoji: '⚠️', label: 'No camera-free path',     sub: 'Every route through this corridor passes a camera.',      color: '#E74C3C' },
};

export function RouteInfoSheet({ result, vehicle }: Props) {
  const { privacy_route: pr, standard_route: sr, overhead: oh, cameras_in_corridor } = result;
  const [expanded, setExpanded] = useState(false);

  const verdict = getVerdict(pr, oh);
  const cfg = VERDICT_CONFIG[verdict];
  const profile = VEHICLE_PROFILES[vehicle];

  // Fuel savings (only when privacy is shorter)
  const fuel = pr && sr ? calcFuelSavings(pr.distance_miles, sr.distance_miles, vehicle) : null;
  const annual = fuel ? annualiseSavings(fuel, 250) : null; // ~5×/week

  // Delta labels
  const timeDelta = oh
    ? oh.extra_seconds === 0    ? 'same time'
      : oh.extra_seconds > 0   ? `+${fmtTime(oh.extra_seconds)} slower`
      : `${fmtTime(-oh.extra_seconds)} faster`
    : null;
  const distDelta = oh
    ? Math.abs(oh.extra_miles) < 0.05 ? 'same distance'
      : oh.extra_miles > 0            ? `+${oh.extra_miles.toFixed(2)} mi longer`
      : `${(-oh.extra_miles).toFixed(2)} mi shorter ✓`
    : null;
  const timeColor  = !oh ? '#888' : oh.extra_seconds <= 0 ? '#27AE60' : oh.extra_seconds < 120 ? '#F39C12' : '#E74C3C';
  const distColor  = !oh ? '#888' : oh.extra_miles <= 0   ? '#27AE60' : '#E74C3C';

  // ── Collapsed summary bar ──
  if (!expanded) {
    return (
      <TouchableOpacity style={styles.collapsedBar} onPress={() => setExpanded(true)} activeOpacity={0.8}>
        <Text style={styles.collapsedVerdict}>{cfg.emoji}</Text>
        <View style={styles.collapsedInfo}>
          <Text style={styles.collapsedLabel} numberOfLines={1}>
            <Text style={{ color: '#4A90D9' }}>🔒 {pr ? fmtTime(pr.duration_seconds) : '—'}</Text>
            {'  ·  '}
            <Text style={{ color: '#888' }}>🚗 {fmtTime(sr.duration_seconds)}</Text>
          </Text>
          <Text style={styles.collapsedSub} numberOfLines={1}>
            <Text style={{ color: '#27AE60' }}>{pr ? pr.cameras_avoided : 0} avoided</Text>
            {'  ·  '}
            <Text style={{ color: '#E74C3C' }}>
              {pr ? cameras_in_corridor - pr.cameras_avoided : cameras_in_corridor} unavoidable
            </Text>
          </Text>
        </View>
        <Text style={styles.collapsedChevron}>▲ Details</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Collapse button */}
      <TouchableOpacity style={styles.collapseBtn} onPress={() => setExpanded(false)}>
        <Text style={styles.collapseBtnText}>▼ Hide details</Text>
      </TouchableOpacity>

      {/* Verdict banner */}
      <View style={[styles.verdictBanner, { backgroundColor: cfg.color + '18', borderColor: cfg.color }]}>
        <Text style={styles.verdictEmoji}>{cfg.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.verdictLabel, { color: cfg.color }]}>{cfg.label}</Text>
          <Text style={styles.verdictSub}>{cfg.sub}</Text>
        </View>
      </View>

      {/* Route cards */}
      <View style={styles.compRow}>
        <View style={[styles.routeCard, styles.privacyCard]}>
          <Text style={styles.routeCardLabel}>🔒 Privacy</Text>
          {pr ? (
            <>
              <Text style={styles.routeCardValue}>{fmtTime(pr.duration_seconds)}</Text>
              <Text style={styles.routeCardSub}>{fmtMiles(pr.distance_miles)}</Text>
            </>
          ) : (
            <Text style={styles.routeCardNA}>Not possible</Text>
          )}
        </View>

        <View style={styles.deltaCol}>
          {timeDelta && <Text style={[styles.deltaVal, { color: timeColor }]}>{timeDelta}</Text>}
          {distDelta && <Text style={[styles.deltaVal, { color: distColor, fontSize: 10, marginTop: 4 }]}>{distDelta}</Text>}
        </View>

        <View style={[styles.routeCard, styles.standardCard]}>
          <Text style={styles.routeCardLabel}>🚗 Fastest</Text>
          <Text style={styles.routeCardValue}>{fmtTime(sr.duration_seconds)}</Text>
          <Text style={styles.routeCardSub}>{fmtMiles(sr.distance_miles)}</Text>
        </View>
      </View>

      {/* Fuel savings card — shown when privacy route is shorter */}
      {fuel && (
        <View style={styles.fuelCard}>
          <View style={styles.fuelHeader}>
            <Text style={styles.fuelTitle}>
              {profile.emoji} {profile.isEV ? 'Energy' : 'Fuel'} savings this trip
            </Text>
            <Text style={styles.fuelVehicle}>{profile.label}</Text>
          </View>

          <View style={styles.fuelRow}>
            {/* Per-trip savings */}
            <View style={styles.fuelStat}>
              <Text style={styles.fuelStatVal}>{fmtDollars(fuel.dollarsaved)}</Text>
              <Text style={styles.fuelStatLabel}>saved</Text>
            </View>
            <View style={styles.fuelDivider} />
            <View style={styles.fuelStat}>
              <Text style={styles.fuelStatVal}>
                {fuel.unit === 'kWh'
                  ? `${fuel.unitsaved.toFixed(3)} kWh`
                  : `${fuel.unitsaved.toFixed(4)} gal`}
              </Text>
              <Text style={styles.fuelStatLabel}>{fuel.unit === 'kWh' ? 'electricity' : 'gasoline'}</Text>
            </View>
            <View style={styles.fuelDivider} />
            <View style={styles.fuelStat}>
              <Text style={styles.fuelStatVal}>{(fuel.co2SavedKg * 1000).toFixed(0)} g</Text>
              <Text style={styles.fuelStatLabel}>CO₂ avoided</Text>
            </View>
          </View>

          {/* Annualised projection */}
          {annual && (
            <View style={styles.annualRow}>
              <Text style={styles.annualText}>
                📅 At 5×/week:{' '}
                <Text style={styles.annualHighlight}>${annual.dollarsPerYear.toFixed(2)}/yr</Text>
                {' · '}
                <Text style={styles.annualHighlight}>{(annual.co2KgPerYear).toFixed(1)} kg CO₂/yr</Text>
                {' · '}
                <Text style={styles.annualHighlight}>{annual.milesPerYear.toFixed(0)} mi/yr</Text>
              </Text>
            </View>
          )}

          <Text style={styles.fuelDisclaimer}>
            Based on {fuel.isEV ? `${VEHICLE_PROFILES[vehicle].milesPerKwh} mi/kWh · $${fuel.elecPrice}/kWh` : `${VEHICLE_PROFILES[vehicle].mpg} mpg · $${fuel.gasPrice}/gal`} (CA avg)
          </Text>
        </View>
      )}

      {/* Camera stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{cameras_in_corridor}</Text>
          <Text style={styles.statLabel}>cameras{'\n'}in corridor</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statVal, { color: '#27AE60' }]}>{pr ? pr.cameras_avoided : 0}</Text>
          <Text style={styles.statLabel}>cameras{'\n'}avoided</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statVal, { color: '#E74C3C' }]}>
            {pr ? cameras_in_corridor - pr.cameras_avoided : cameras_in_corridor}
          </Text>
          <Text style={styles.statLabel}>cameras{'\n'}unavoidable</Text>
        </View>
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

  // Collapsed summary bar
  collapsedBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a2eee', borderRadius: 14,
    margin: 10, padding: 10, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, elevation: 5,
  },
  collapsedVerdict: { fontSize: 20 },
  collapsedInfo: { flex: 1 },
  collapsedLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  collapsedSub: { color: '#aaa', fontSize: 11, marginTop: 2 },
  collapsedChevron: { color: '#4A90D9', fontSize: 11, fontWeight: '600' },

  // Collapse button inside full sheet
  collapseBtn: { alignItems: 'center', marginBottom: 10 },
  collapseBtnText: { color: '#555', fontSize: 11 },

  verdictBanner: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12, gap: 10,
  },
  verdictEmoji: { fontSize: 22 },
  verdictLabel: { fontWeight: '700', fontSize: 13 },
  verdictSub: { color: '#888', fontSize: 11, marginTop: 1 },

  compRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  routeCard: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  privacyCard: { backgroundColor: '#4A90D922', borderWidth: 1, borderColor: '#4A90D9' },
  standardCard: { backgroundColor: '#88888822', borderWidth: 1, borderColor: '#555' },
  routeCardLabel: { color: '#aaa', fontSize: 11, marginBottom: 4 },
  routeCardValue: { color: '#fff', fontSize: 18, fontWeight: '700' },
  routeCardSub: { color: '#888', fontSize: 11, marginTop: 2 },
  routeCardNA: { color: '#E74C3C', fontSize: 13, fontWeight: '600', marginTop: 4 },
  deltaCol: { width: 80, alignItems: 'center', paddingHorizontal: 4 },
  deltaVal: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  // Fuel card
  fuelCard: {
    backgroundColor: '#0a1a0f', borderWidth: 1, borderColor: '#27AE60',
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  fuelHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  fuelTitle: { color: '#2ECC71', fontWeight: '700', fontSize: 13 },
  fuelVehicle: { color: '#ccc', fontSize: 11, fontWeight: '500' },
  fuelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  fuelStat: { flex: 1, alignItems: 'center' },
  fuelStatVal: { color: '#fff', fontSize: 15, fontWeight: '700' },
  fuelStatLabel: { color: '#bbb', fontSize: 10.5, marginTop: 2, fontWeight: '500' },
  fuelDivider: { width: 1, height: 32, backgroundColor: '#1e3a1e' },
  annualRow: {
    backgroundColor: '#0f2915', borderRadius: 8, padding: 8, marginBottom: 6,
  },
  annualText: { color: '#ccc', fontSize: 11, textAlign: 'center' },
  annualHighlight: { color: '#4ade80', fontWeight: '600' },
  fuelDisclaimer: { color: '#999', fontSize: 10, textAlign: 'center', marginTop: 2 },

  // Camera stats
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#0d0d1e', borderRadius: 10, paddingVertical: 10, marginBottom: 10,
  },
  stat: { alignItems: 'center' },
  statVal: { color: '#fff', fontSize: 22, fontWeight: '700' },
  statLabel: { color: '#bbb', fontSize: 10.5, textAlign: 'center', marginTop: 2, fontWeight: '500' },

  legend: { flexDirection: 'row', justifyContent: 'space-around' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#888', fontSize: 10 },
});
