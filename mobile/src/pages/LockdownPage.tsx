import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { track } from '@vercel/analytics';
import {
  PARTNERS,
  PARTNER_PROMO_CODE,
  KOFI_URL,
  INSTAGRAM_URL,
  GITHUB_URL,
  PartnerConfig,
} from '../config/partners';

interface Props {
  navigate: (path: string) => void;
}

export function LockdownPage({ navigate }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCode = (partnerId: string, code: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(code);
      }
      track('partner_code_copied', { partner: partnerId, code });
    } catch {}
    setCopiedId(partnerId);
    setTimeout(() => {
      setCopiedId(prev => (prev === partnerId ? null : prev));
    }, 2200);
  };

  const handlePartnerClick = (partner: PartnerConfig, placement: string) => {
    try {
      track('partner_click', { partner: partner.id, placement });
    } catch {}
    Linking.openURL(partner.url);
  };

  const renderPartnerCard = (partner: PartnerConfig) => {
    const isCopied = copiedId === partner.id;
    return (
      <View
        key={partner.id}
        style={[styles.layerCard, { borderLeftColor: partner.accentColor }]}
      >
        <View style={styles.layerHeaderRow}>
          <Text style={[styles.layerBadge, { color: partner.accentColor }]}>
            {partner.layerBadge}
          </Text>
          <View
            style={[
              styles.offerPill,
              {
                borderColor: partner.accentColor + '66',
                backgroundColor: partner.accentColor + '15',
              },
            ]}
          >
            <Text style={[styles.offerPillText, { color: partner.accentColor }]}>
              {partner.offerBadge}
            </Text>
          </View>
        </View>

        <Text style={styles.layerTitle}>{partner.headline}</Text>
        <Text style={styles.partnerSub}>
          Recommended Partner: <Text style={styles.highlight}>{partner.name}</Text> ({partner.handle})
        </Text>

        <View style={styles.threatBox}>
          <Text style={styles.threatLabel}>⚠️ SURVEILLANCE VECTOR</Text>
          <Text style={styles.threatBody}>{partner.threatVector}</Text>
        </View>

        <Text style={styles.body}>{partner.solutionSummary}</Text>

        <View style={styles.specsList}>
          {partner.specs.map(spec => (
            <View key={spec} style={styles.specRow}>
              <Text style={[styles.specCheck, { color: partner.accentColor }]}>✓</Text>
              <Text style={styles.specText}>{spec}</Text>
            </View>
          ))}
        </View>

        {/* Promo Code + Primary Action Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.codeBtn,
              isCopied && { borderColor: '#4ade80', backgroundColor: '#052e16' },
            ]}
            onPress={() => handleCopyCode(partner.id, partner.promoCode)}
            activeOpacity={0.75}
          >
            <Text style={styles.codeBtnLabel}>
              {isCopied ? '✓ COPIED CODE' : 'TAP TO COPY CODE'}
            </Text>
            <Text
              style={[
                styles.codeBtnValue,
                isCopied && { color: '#4ade80' },
              ]}
            >
              {partner.promoCode}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.partnerCtaBtn, { backgroundColor: partner.accentColor }]}
            onPress={() => handlePartnerClick(partner, 'lockdown_card')}
            activeOpacity={0.8}
          >
            <Text style={styles.partnerCtaText}>{partner.ctaLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Top Navigation */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigate('/')} style={styles.navBack}>
          <Text style={styles.navBackText}>← Live Map & Router</Text>
        </TouchableOpacity>
        <View style={styles.navLinks}>
          <TouchableOpacity onPress={() => navigate('/about')}>
            <Text style={styles.navLink}>About</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => navigate('/privacy')}>
            <Text style={styles.navLink}>Privacy</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL(INSTAGRAM_URL)}>
            <Text style={styles.navLink}>@fourthroute ↗</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Hero / Canonical Link-in-Bio Header */}
        <View style={styles.hero}>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>
              🛡️ 145,283 CAMERAS MAPPED · 21-STATE ROUTING LIVE
            </Text>
          </View>
          <Text style={styles.heroTitle}>The 4-Layer Commuter Lockdown</Text>
          <Text style={styles.heroTagline}>
            Optical ALPR avoidance, hardware RF isolation, data broker removal & zero-telemetry navigation.
          </Text>

          {/* Quick-Launch Link-in-Bio Stack */}
          <View style={styles.quickLinksGrid}>
            <TouchableOpacity
              style={styles.primaryMapBtn}
              onPress={() => {
                try {
                  track('lockdown_open_map');
                } catch {}
                navigate('/');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryMapBtnTitle}>
                🗺️ Launch Live ALPR Map & Privacy Router →
              </Text>
              <Text style={styles.primaryMapBtnSub}>
                50-State Camera Map · 1,528 Police Portals · 21-State Avoidance Routing
              </Text>
            </TouchableOpacity>

            <View style={styles.secondaryQuickRow}>
              <TouchableOpacity
                style={[styles.secondaryQuickBtn, { borderColor: '#38bdf866' }]}
                onPress={() => handlePartnerClick(PARTNERS.slnt, 'hero_quick_pill')}
              >
                <Text style={[styles.secondaryQuickTitle, { color: '#38bdf8' }]}>
                  📵 SLNT® Faraday Gear
                </Text>
                <Text style={styles.secondaryQuickSub}>Code: {PARTNER_PROMO_CODE}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryQuickBtn, { borderColor: '#4ade8066' }]}
                onPress={() => handlePartnerClick(PARTNERS.deleteme, 'hero_quick_pill')}
              >
                <Text style={[styles.secondaryQuickTitle, { color: '#4ade80' }]}>
                  🧹 DeleteMe Broker Purge
                </Text>
                <Text style={styles.secondaryQuickSub}>20% Off · {PARTNER_PROMO_CODE}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.secondaryQuickRow}>
              <TouchableOpacity
                style={[styles.secondaryQuickBtn, { borderColor: '#E8C97A55' }]}
                onPress={() => {
                  try {
                    track('click_kofi_lockdown_hero');
                  } catch {}
                  Linking.openURL(KOFI_URL);
                }}
              >
                <Text style={[styles.secondaryQuickTitle, { color: '#E8C97A' }]}>
                  ☕ Fund 50-State Servers
                </Text>
                <Text style={styles.secondaryQuickSub}>ko-fi.com/fourthroute</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryQuickBtn, { borderColor: '#f472b655' }]}
                onPress={() => Linking.openURL(INSTAGRAM_URL)}
              >
                <Text style={[styles.secondaryQuickTitle, { color: '#f472b6' }]}>
                  📷 @fourthroute Reels
                </Text>
                <Text style={styles.secondaryQuickSub}>City Corridor Audits</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Section Intro */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>DEFENSE-IN-DEPTH ARCHITECTURE</Text>
          <Text style={styles.sectionTitle}>
            Why Avoiding the Camera Is Only Step One
          </Text>
          <Text style={styles.body}>
            Modern roadside surveillance operates across four overlapping layers: optical license plate cameras, cellular/RF hardware beacons, commercial data broker dossiers, and mobile app telemetry. Locking down your daily commute requires closing all four vectors.
          </Text>
        </View>

        {/* LAYER 01: FOURTH ROUTE */}
        <View style={[styles.layerCard, { borderLeftColor: '#E8C97A' }]}>
          <View style={styles.layerHeaderRow}>
            <Text style={[styles.layerBadge, { color: '#E8C97A' }]}>
              LAYER 01 · OPTICAL ALPR CAMERA AVOIDANCE
            </Text>
            <View
              style={[
                styles.offerPill,
                { borderColor: '#E8C97A66', backgroundColor: '#E8C97A15' },
              ]}
            >
              <Text style={[styles.offerPillText, { color: '#E8C97A' }]}>
                100% Free & Open Source
              </Text>
            </View>
          </View>

          <Text style={styles.layerTitle}>
            Route Around Warrantless License Plate Readers
          </Text>
          <Text style={styles.partnerSub}>
            Core Engine: <Text style={styles.highlight}>Fourth Route (AGPL-3.0)</Text>
          </Text>

          <View style={styles.threatBox}>
            <Text style={styles.threatLabel}>⚠️ SURVEILLANCE VECTOR</Text>
            <Text style={styles.threatBody}>
              Flock Safety, Vigilant, and Rekor cameras photograph every passing vehicle, logging your plate, vehicle make/model, bumper stickers, timestamp, and GPS coordinates into searchable portals retained for 30 to 1,095+ days and shared across up to 1,900+ agencies.
            </Text>
          </View>

          <Text style={styles.body}>
            Fourth Route pairs a 145,283-camera PostGIS spatial database with a custom Valhalla routing engine that draws 40-meter exclusion polygons around ALPR nodes — computing a clean privacy route alongside the standard route.
          </Text>

          <View style={styles.specsList}>
            {[
              '145,283 ALPR cameras mapped across all 50 US states & D.C.',
              '1,528 verified law enforcement transparency portals inspectable on tap',
              'Live privacy routing across 21 states + D.C. & Delaware I-95 corridor',
              'Right-click or long-press anywhere on the map to self-report new cameras',
            ].map(spec => (
              <View key={spec} style={styles.specRow}>
                <Text style={[styles.specCheck, { color: '#E8C97A' }]}>✓</Text>
                <Text style={styles.specText}>{spec}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.partnerCtaBtn, { backgroundColor: '#E8C97A', marginTop: 6 }]}
            onPress={() => navigate('/')}
          >
            <Text style={styles.partnerCtaText}>Audit Your Daily Commute on the Map →</Text>
          </TouchableOpacity>
        </View>

        {/* LAYER 02: SLNT */}
        {renderPartnerCard(PARTNERS.slnt)}

        {/* LAYER 03: DELETEME */}
        {renderPartnerCard(PARTNERS.deleteme)}

        {/* LAYER 04: NAVIGATION TELEMETRY HYGIENE */}
        <View style={[styles.layerCard, { borderLeftColor: '#a78bfa' }]}>
          <View style={styles.layerHeaderRow}>
            <Text style={[styles.layerBadge, { color: '#a78bfa' }]}>
              LAYER 04 · EPHEMERAL NAVIGATION TELEMETRY HYGIENE
            </Text>
            <View
              style={[
                styles.offerPill,
                { borderColor: '#a78bfa66', backgroundColor: '#a78bfa15' },
              ]}
            >
              <Text style={[styles.offerPillText, { color: '#a78bfa' }]}>
                Built-In Mode
              </Text>
            </View>
          </View>

          <Text style={styles.layerTitle}>
            Navigate Without Feeding Big Tech Location Brokers
          </Text>
          <Text style={styles.partnerSub}>
            Protocol: <Text style={styles.highlight}>In-App Turn-by-Turn & Offline Maps</Text>
          </Text>

          <View style={styles.threatBox}>
            <Text style={styles.threatLabel}>⚠️ SURVEILLANCE VECTOR</Text>
            <Text style={styles.threatBody}>
              Exporting a clean route into mainstream navigation apps ties your origin, destination, and real-time GPS velocity stream to your permanent advertising ID and cloud account — subject to geofence warrants and commercial telemetry resale.
            </Text>
          </View>

          <Text style={styles.body}>
            Fourth Route computes routes ephemerally in RAM with zero user accounts, zero search history logs, and server-proxied geocoding.
          </Text>

          <View style={styles.specsList}>
            {[
              'MAXIMUM LOCKDOWN: Tap "📋 Turn-by-Turn Directions" inside Fourth Route to read every street maneuver natively with zero external telemetry.',
              'OFFLINE OPEN-SOURCE: Export clean waypoints to Organic Maps or OsmAnd for offline GPS navigation.',
              'IF USING APPLE / GOOGLE / WAZE: Fourth Route strips intermediate camera coordinates and exports up to 8 road-snapped navigational waypoints.',
            ].map(spec => (
              <View key={spec} style={styles.specRow}>
                <Text style={[styles.specCheck, { color: '#a78bfa' }]}>✓</Text>
                <Text style={styles.specText}>{spec}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Transparency & Independence Disclosure */}
        <View style={styles.disclosureCard}>
          <Text style={styles.disclosureTitle}>
            ⚖️ Open-Source Independence & Partner Disclosure
          </Text>
          <Text style={styles.disclosureBody}>
            Fourth Route has zero corporate investors, zero paywalls, and zero ad-tech SDKs. When you use code{' '}
            <Text style={styles.highlight}>{PARTNER_PROMO_CODE}</Text> with vetted privacy hardware and data-removal partners like SLNT® and DeleteMe, or contribute on{' '}
            <Text
              style={styles.link}
              onPress={() => Linking.openURL(KOFI_URL)}
            >
              Ko-fi
            </Text>
            , a portion directly funds our Valhalla routing servers, PostGIS spatial database, and 50-state expansion.
          </Text>
          <View style={styles.disclosureBtnRow}>
            <TouchableOpacity
              style={styles.kofiBtn}
              onPress={() => {
                try {
                  track('click_kofi_lockdown_footer');
                } catch {}
                Linking.openURL(KOFI_URL);
              }}
            >
              <Text style={styles.kofiBtnText}>☕ Support Server Costs on Ko-fi</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.githubBtn}
              onPress={() => Linking.openURL(GITHUB_URL)}
            >
              <Text style={styles.githubBtnText}>💻 Audit Source Code on GitHub ↗</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Fourth Route · Free & Open-Source (AGPL-3.0) · fourthroute.org
          </Text>
          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={() => navigate('/')}>
              <Text style={styles.footerLink}>Map</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <TouchableOpacity onPress={() => navigate('/about')}>
              <Text style={styles.footerLink}>About</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <TouchableOpacity onPress={() => navigate('/privacy')}>
              <Text style={styles.footerLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <TouchableOpacity onPress={() => navigate('/terms')}>
              <Text style={styles.footerLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <TouchableOpacity onPress={() => navigate('/contact')}>
              <Text style={styles.footerLink}>Contact</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d1e', minHeight: '100vh' as any },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e3a',
    backgroundColor: '#0d0d1edd',
  },
  navBack: {},
  navBackText: { color: '#E8C97A', fontSize: 14, fontWeight: '600' },
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navLink: { color: '#888', fontSize: 12 },
  navDot: { color: '#333', fontSize: 12 },

  scroll: { flex: 1 },
  content: {
    maxWidth: 740,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 64,
  },

  hero: { alignItems: 'center', paddingTop: 36, paddingBottom: 28 },
  statusPill: {
    backgroundColor: '#132a20',
    borderWidth: 1,
    borderColor: '#4ade8055',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 14,
  },
  statusPillText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroTagline: {
    color: '#94a3b8',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
    maxWidth: 580,
  },

  quickLinksGrid: {
    width: '100%',
    gap: 10,
  },
  primaryMapBtn: {
    backgroundColor: '#E8C97A',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  primaryMapBtnTitle: {
    color: '#0d0d1e',
    fontSize: 16,
    fontWeight: '800',
  },
  primaryMapBtnSub: {
    color: '#22223b',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },
  secondaryQuickRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  secondaryQuickBtn: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#13132b',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  secondaryQuickTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryQuickSub: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },

  divider: { height: 1, backgroundColor: '#1e1e3a', marginVertical: 12 },

  sectionHeader: { marginTop: 16, marginBottom: 8 },
  sectionLabel: {
    color: '#E8C97A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
    lineHeight: 28,
  },
  body: { color: '#cbd5e1', fontSize: 14, lineHeight: 22, marginBottom: 12 },
  highlight: { color: '#fff', fontWeight: '700' },
  link: { color: '#E8C97A', textDecorationLine: 'underline' },

  layerCard: {
    backgroundColor: '#111127',
    borderWidth: 1,
    borderColor: '#252547',
    borderLeftWidth: 4,
    borderRadius: 16,
    padding: 20,
    marginVertical: 10,
  },
  layerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  layerBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  offerPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  offerPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  layerTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 25,
    marginBottom: 4,
  },
  partnerSub: {
    color: '#94a3b8',
    fontSize: 12.5,
    marginBottom: 12,
  },
  threatBox: {
    backgroundColor: '#191224',
    borderWidth: 1,
    borderColor: '#ef444444',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  threatLabel: {
    color: '#f87171',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  threatBody: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 19,
  },
  specsList: {
    marginBottom: 14,
    gap: 6,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  specCheck: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  specText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'stretch',
    marginTop: 4,
  },
  codeBtn: {
    backgroundColor: '#181836',
    borderWidth: 1,
    borderColor: '#3b3b6d',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 140,
  },
  codeBtnLabel: {
    color: '#94a3b8',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  codeBtnValue: {
    color: '#E8C97A',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  partnerCtaBtn: {
    flex: 1,
    minWidth: 200,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  partnerCtaText: {
    color: '#0d0d1e',
    fontSize: 14,
    fontWeight: '800',
  },

  disclosureCard: {
    backgroundColor: '#13132b',
    borderWidth: 1,
    borderColor: '#2a2a4a',
    borderRadius: 14,
    padding: 18,
    marginTop: 18,
  },
  disclosureTitle: {
    color: '#E8C97A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  disclosureBody: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  disclosureBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kofiBtn: {
    backgroundColor: '#E8C97A22',
    borderWidth: 1,
    borderColor: '#E8C97A66',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  kofiBtnText: {
    color: '#E8C97A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  githubBtn: {
    backgroundColor: '#1e1e3a',
    borderWidth: 1,
    borderColor: '#33335a',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  githubBtnText: {
    color: '#cbd5e1',
    fontSize: 12.5,
    fontWeight: '600',
  },

  footer: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#1e1e3a',
    alignItems: 'center',
    gap: 8,
  },
  footerText: { color: '#555', fontSize: 12, textAlign: 'center' },
  footerLinks: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  footerLink: { color: '#666', fontSize: 12 },
  footerDot: { color: '#333', fontSize: 12 },
});
