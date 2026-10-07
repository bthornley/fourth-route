import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { track } from '@vercel/analytics';
import { CompareResult, Maneuver, decodePolyline } from '../services/api';
import {
  VehicleType, VEHICLE_PROFILES,
  calcFuelSavings, annualiseSavings,
} from '../services/fuel';

interface Props {
  result: CompareResult;
  vehicle: VehicleType;
  onClear?: () => void;
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

function getManeuverIcon(type: number): string {
  switch (type) {
    case 1: case 2: case 3: return '🚗';
    case 7: case 8: return '↖️';
    case 9: case 15: return '⬅️';
    case 10: case 16: return '➡️';
    case 11: case 12: return '↗️';
    case 13: return '🔄';
    case 4: case 5: case 6: return '🏁';
    case 17: case 18: return '🛣️';
    case 24: return '🔄';
    default: return '⬆️';
  }
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

export function RouteInfoSheet({ result, vehicle, onClear }: Props) {
  const { privacy_route: pr, standard_route: sr, overhead: oh, cameras_in_corridor } = result;
  const [expanded, setExpanded] = useState(false);
  const [showDirections, setShowDirections] = useState(false);
  const [copied, setCopied] = useState(false);

  const maneuvers: Maneuver[] = pr?.route?.trip?.legs?.[0]?.maneuvers ?? [];
  const shapeEncoded: string = pr?.route?.trip?.legs?.[0]?.shape ?? '';

  const coords = shapeEncoded ? decodePolyline(shapeEncoded) : [];
  const originCoord = coords.length > 0 ? coords[0] : null; // [lon, lat]
  const destCoord = coords.length > 0 ? coords[coords.length - 1] : null; // [lon, lat]

  // Sample up to 4 intermediate waypoints along the route geometry to guide Google/Apple Maps
  const waypoints: [number, number][] = [];
  if (coords.length > 10) {
    const step = Math.floor(coords.length / 5);
    for (let i = 1; i <= 4; i++) {
      const idx = i * step;
      if (idx < coords.length - 1) {
        waypoints.push(coords[idx]);
      }
    }
  }

  const googleMapsUrl = originCoord && destCoord ? (() => {
    const originStr = `${originCoord[1].toFixed(5)},${originCoord[0].toFixed(5)}`;
    const destStr = `${destCoord[1].toFixed(5)},${destCoord[0].toFixed(5)}`;
    const wpStr = waypoints.map(pt => `${pt[1].toFixed(5)},${pt[0].toFixed(5)}`).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}${wpStr ? `&waypoints=${encodeURIComponent(wpStr)}` : ''}&travelmode=driving`;
  })() : null;

  const appleMapsUrl = originCoord && destCoord ? (() => {
    const saddr = `${originCoord[1].toFixed(5)},${originCoord[0].toFixed(5)}`;
    const daddrParts = [...waypoints.map(pt => `${pt[1].toFixed(5)},${pt[0].toFixed(5)}`), `${destCoord[1].toFixed(5)},${destCoord[0].toFixed(5)}`];
    const daddr = daddrParts.join('+to:');
    return `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=d`;
  })() : null;

  const handleCopyDirections = () => {
    if (!maneuvers.length) return;
    const textLines = [
      'Fourth Route (Privacy Route)',
      `Avoids ${pr?.cameras_avoided ?? 0} cameras · ${fmtTime(pr?.duration_seconds ?? 0)} · ${fmtMiles(pr?.distance_miles ?? 0)}`,
      '',
      ...maneuvers.map((m, idx) => `${idx + 1}. ${m.instruction} (${fmtMiles(m.length)})`),
    ];
    const fullText = textLines.join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      try { track('copy_directions'); } catch {}
    }
  };

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
      <View style={styles.collapsedBarWrapper}>
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
        {onClear && (
          <TouchableOpacity
            style={styles.sheetMiniClearBtn}
            onPress={onClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.sheetMiniClearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top action row */}
      <View style={styles.sheetTopRow}>
        <TouchableOpacity style={styles.collapseBtn} onPress={() => setExpanded(false)}>
          <Text style={styles.collapseBtnText}>▼ Hide details</Text>
        </TouchableOpacity>
        {onClear && (
          <TouchableOpacity style={styles.sheetClearBtn} onPress={onClear}>
            <Text style={styles.sheetClearText}>✕ Clear route</Text>
          </TouchableOpacity>
        )}
      </View>

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

      {/* ── Real-Time Navigation & Turn-by-Turn ── */}
      <View style={styles.navSection}>
        <View style={styles.navHeaderRow}>
          <Text style={styles.navSectionTitle}>🧭 Real-Time Navigation</Text>
          {maneuvers.length > 0 && (
            <TouchableOpacity
              style={styles.copyDirectionsBtn}
              onPress={handleCopyDirections}
              activeOpacity={0.7}
            >
              <Text style={styles.copyDirectionsBtnText}>
                {copied ? '✓ Copied' : '📋 Copy Steps'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Telemetry Disclaimer Box */}
        <View style={styles.telemetryDisclaimerBox}>
          <Text style={styles.telemetryDisclaimerIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.telemetryDisclaimerTitle}>Privacy & Telemetry Notice</Text>
            <Text style={styles.telemetryDisclaimerText}>
              Google Maps and Apple Maps collect real-time location telemetry on their servers during navigation. Fourth Route embeds privacy waypoints to help external apps follow our camera-avoidance corridor, but external navigation is subject to Google and Apple data collection policies.
            </Text>
          </View>
        </View>

        {/* External Map Launch Buttons */}
        <View style={styles.externalBtnRow}>
          {googleMapsUrl && (
            <TouchableOpacity
              style={styles.googleMapsBtn}
              onPress={() => {
                try { track('open_in_google_maps'); } catch {}
                Linking.openURL(googleMapsUrl);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.externalBtnIcon}>↗️</Text>
              <Text style={styles.externalBtnText}>Google Maps</Text>
            </TouchableOpacity>
          )}

          {appleMapsUrl && (
            <TouchableOpacity
              style={styles.appleMapsBtn}
              onPress={() => {
                try { track('open_in_apple_maps'); } catch {}
                Linking.openURL(appleMapsUrl);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.externalBtnIcon}>🍎</Text>
              <Text style={styles.externalBtnText}>Apple Maps</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Turn-by-Turn Accordion Toggle */}
        {maneuvers.length > 0 && (
          <TouchableOpacity
            style={styles.directionsToggleBtn}
            onPress={() => {
              const next = !showDirections;
              setShowDirections(next);
              try { track('toggle_turn_by_turn', { expanded: next }); } catch {}
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.directionsToggleText}>
              📋 Turn-by-Turn Directions ({maneuvers.length} steps) {showDirections ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Turn-by-turn list */}
        {showDirections && maneuvers.length > 0 && (
          <View style={styles.maneuversList}>
            {maneuvers.map((m, idx) => (
              <View
                key={idx}
                style={[
                  styles.maneuverItem,
                  idx < maneuvers.length - 1 && styles.maneuverItemDivider,
                ]}
              >
                <View style={styles.maneuverNumCol}>
                  <Text style={styles.maneuverNum}>{idx + 1}</Text>
                  <Text style={styles.maneuverIcon}>{getManeuverIcon(m.type)}</Text>
                </View>
                <View style={styles.maneuverContent}>
                  <Text style={styles.maneuverInstruction}>{m.instruction}</Text>
                  <Text style={styles.maneuverMeta}>
                    {fmtMiles(m.length)} · {fmtTime(m.time)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
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
  collapsedBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 10,
  },
  collapsedBar: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a2eee', borderRadius: 14,
    padding: 10, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, elevation: 5,
  },
  collapsedVerdict: { fontSize: 20 },
  collapsedInfo: { flex: 1 },
  collapsedLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  collapsedSub: { color: '#aaa', fontSize: 11, marginTop: 2 },
  collapsedChevron: { color: '#4A90D9', fontSize: 11, fontWeight: '600' },
  sheetMiniClearBtn: {
    backgroundColor: '#1a1a2eee',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#333355',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetMiniClearText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
  },

  // Collapse button inside full sheet
  sheetTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  collapseBtn: { alignItems: 'center' },
  collapseBtnText: { color: '#555', fontSize: 11 },
  sheetClearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#252545',
    borderWidth: 1,
    borderColor: '#3d3d65',
  },
  sheetClearText: {
    color: '#E8C97A',
    fontSize: 11.5,
    fontWeight: '600',
  },

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

  // Real-time navigation section
  navSection: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#252545',
  },
  navHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  navSectionTitle: {
    color: '#E8C97A',
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  copyDirectionsBtn: {
    backgroundColor: '#1b2a4a',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#3a5488',
  },
  copyDirectionsBtnText: {
    color: '#70A5F9',
    fontSize: 11,
    fontWeight: '600',
  },
  telemetryDisclaimerBox: {
    flexDirection: 'row',
    backgroundColor: '#2b1b11',
    borderWidth: 1,
    borderColor: '#8d5023',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    gap: 8,
  },
  telemetryDisclaimerIcon: {
    fontSize: 14,
  },
  telemetryDisclaimerTitle: {
    color: '#F39C12',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  telemetryDisclaimerText: {
    color: '#d4bba2',
    fontSize: 10.5,
    lineHeight: 14,
  },
  externalBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  googleMapsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a3350',
    borderWidth: 1,
    borderColor: '#2b5f9e',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 6,
  },
  appleMapsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#232338',
    borderWidth: 1,
    borderColor: '#434368',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 6,
  },
  externalBtnIcon: {
    fontSize: 13,
  },
  externalBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  directionsToggleBtn: {
    backgroundColor: '#131327',
    borderWidth: 1,
    borderColor: '#2a2a4a',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  directionsToggleText: {
    color: '#ccc',
    fontSize: 11.5,
    fontWeight: '600',
  },
  maneuversList: {
    backgroundColor: '#111124',
    borderWidth: 1,
    borderColor: '#252542',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxHeight: 220,
    overflow: 'scroll' as any,
  },
  maneuverItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 7,
    gap: 10,
  },
  maneuverItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c38',
  },
  maneuverNumCol: {
    alignItems: 'center',
    width: 24,
  },
  maneuverNum: {
    color: '#666',
    fontSize: 10,
    fontWeight: '600',
  },
  maneuverIcon: {
    fontSize: 13,
    marginTop: 1,
  },
  maneuverContent: {
    flex: 1,
  },
  maneuverInstruction: {
    color: '#eee',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  maneuverMeta: {
    color: '#888',
    fontSize: 10.5,
    marginTop: 2,
  },
});
