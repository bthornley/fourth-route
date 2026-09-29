import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';

interface Props {
  navigate: (path: string) => void;
}

export function AboutPage({ navigate }: Props) {
  return (
    <View style={styles.root}>
      {/* Nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigate('/')} style={styles.navBack}>
          <Text style={styles.navBackText}>← Map</Text>
        </TouchableOpacity>
        <View style={styles.navLinks}>
          <TouchableOpacity onPress={() => navigate('/privacy')}>
            <Text style={styles.navLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => navigate('/terms')}>
            <Text style={styles.navLink}>Terms</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => navigate('/contact')}>
            <Text style={styles.navLink}>Contact</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://github.com/bthornley/fourth-route')}>
            <Text style={styles.navLink}>GitHub ↗</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>⚖️</Text>
          <Text style={styles.heroTitle}>Fourth Route</Text>
          <Text style={styles.heroTagline}>Navigate within your 4th Amendment rights</Text>
          <Text style={styles.heroSub}>Available in California · Washington · Oregon · Texas</Text>
          <TouchableOpacity style={styles.heroBtn} onPress={() => navigate('/')}>
            <Text style={styles.heroBtnText}>Open the map →</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* What is ALPR */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>The problem</Text>
          <Text style={styles.sectionTitle}>Your plate is logged every time you drive past a camera</Text>
          <Text style={styles.body}>
            Automated License Plate Readers (ALPRs) photograph every vehicle that passes — at neighborhood entrances, shopping centers, school zones, highway on-ramps. The image is timestamped, geotagged, and uploaded instantly to a searchable database.
          </Text>
          <Text style={styles.body}>
            This data is retained for months or years and shared across thousands of law enforcement agencies — with no warrant, no probable cause, and no notification to you. Vendors like Flock Safety, Motorola Solutions, and Rekor operate these networks commercially and sell data access to agencies, insurance companies, and data brokers.
          </Text>
          <Text style={styles.body}>
            A Brookings Institution analysis found ALPR deployments are <Text style={styles.highlight}>2.3× denser in majority-Black and Latino neighborhoods</Text> — surveillance concentrated where it is least consented to.
          </Text>
        </View>

        {/* Why these states */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Why these states</Text>
          <Text style={styles.sectionTitle}>We prioritize places that are fighting back</Text>
          <Text style={styles.body}>
            Fourth Route deliberately expands to states where residents, legislatures, and local governments are actively pushing back against mass ALPR surveillance — making our tool most relevant where the political moment is live.
          </Text>
          {[
            ['⚖️ Washington', 'Passed SB 6002 requiring a court-issued probable cause warrant for law enforcement to access ALPR data held by private vendors — the strongest ALPR privacy law in the country.'],
            ['🏛️ Oregon', 'State law gives residents the right to sue ALPR vendors directly and limits data retention to 30 days. Lawmakers are considering a full ban.'],
            ['🤠 Texas', '14+ cities and counties have canceled Flock Safety contracts and shut off 900+ cameras after the state blocked ALPR funding. Includes Plano, Kendall County, and others.'],
            ['🌅 California', '16,200 cameras mapped statewide — the original dataset and densest ALPR network in the US, with documented use for immigration enforcement and protest tracking.'],
          ].map(([icon, desc]) => (
            <View key={icon as string} style={styles.stateCard}>
              <Text style={styles.stateIcon}>{icon}</Text>
              <Text style={styles.stateDesc}>{desc}</Text>
            </View>
          ))}
        </View>

        {/* Concrete example */}
        <View style={styles.exampleCard}>
          <Text style={styles.exampleLabel}>Example route</Text>
          <Text style={styles.exampleRoute}>Oakland Financial District → Fruitvale</Text>
          <View style={styles.exampleRow}>
            <View style={styles.exampleStat}>
              <Text style={styles.exampleNum}>716</Text>
              <Text style={styles.exampleDesc}>cameras in corridor</Text>
            </View>
            <View style={styles.exampleArrow}><Text style={styles.exampleArrowText}>→</Text></View>
            <View style={styles.exampleStat}>
              <Text style={[styles.exampleNum, { color: '#4ade80' }]}>686</Text>
              <Text style={styles.exampleDesc}>avoided by Fourth Route</Text>
            </View>
            <View style={styles.exampleArrow}><Text style={styles.exampleArrowText}>+</Text></View>
            <View style={styles.exampleStat}>
              <Text style={[styles.exampleNum, { color: '#E8C97A' }]}>+2 min</Text>
              <Text style={styles.exampleDesc}>time overhead</Text>
            </View>
          </View>
          <Text style={styles.exampleFootnote}>30 cameras remain on unavoidable chokepoints. Privacy costs about $0.03 in extra fuel.</Text>
        </View>

        {/* How it works */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>How it works</Text>
          <Text style={styles.sectionTitle}>Two routes. One choice.</Text>
          <Text style={styles.body}>
            Enter an origin and destination. Fourth Route calculates two paths using the Valhalla open-source routing engine:
          </Text>
          {[
            ['Standard route', 'The fastest available path, shown for comparison'],
            ['Privacy route', 'A camera-minimizing alternative, computed by treating camera corridors as soft-penalty zones'],
          ].map(([label, desc]) => (
            <View key={label} style={styles.bullet}>
              <Text style={styles.bulletLabel}>{label}</Text>
              <Text style={styles.bulletDesc}>{desc}</Text>
            </View>
          ))}
          <Text style={styles.body}>
            Camera counts are computed by decoding the route polyline to a geographic linestring and running a PostGIS <Text style={styles.code}>ST_DWithin</Text> spatial query — counting only cameras you actually pass, not just cameras near your origin or destination.
          </Text>
          <Text style={styles.body}>
            <Text style={styles.highlight}>38,368 cameras</Text> are mapped across California, Washington, Oregon, and Texas. The database syncs from OpenStreetMap and public FOIA records every week via automated GitHub Actions.
          </Text>
        </View>

        {/* Who it's for */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Who it's for</Text>
          <Text style={styles.sectionTitle}>Anyone who drives in CA, WA, OR, or TX</Text>
          {[
            ['🔒 Privacy-conscious drivers', 'Exercising the right to travel without mass surveillance logging every movement'],
            ['⚠️ Domestic violence survivors', 'Abusers with law enforcement contacts or data broker access can track movements through ALPR systems — avoidance routing is a safety tool'],
            ['📰 Journalists & whistleblowers', 'Professionals who need to meet sources without leaving a commercially available trail'],
            ['✊ Activists & organizers', 'People vulnerable to targeted tracking during protests, political organizing, or visits to reproductive health clinics'],
          ].map(([icon, desc]) => (
            <View key={icon as string} style={styles.personCard}>
              <Text style={styles.personIcon}>{icon}</Text>
              <Text style={styles.personDesc}>{desc}</Text>
            </View>
          ))}
        </View>

        {/* Open source */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Open source</Text>
          <Text style={styles.sectionTitle}>Every line of code is public</Text>
          <Text style={styles.body}>
            Fourth Route is released under the <Text style={styles.highlight}>GNU Affero General Public License v3 (AGPL-3.0)</Text>. The full codebase — API, routing engine configuration, mobile app, camera ETL pipeline — is published at{' '}
            <Text style={styles.link} onPress={() => Linking.openURL('https://github.com/bthornley/fourth-route')}>
              github.com/bthornley/fourth-route
            </Text>.
          </Text>
          <Text style={styles.body}>
            Anyone can fork it, audit it, self-host it for their city, or adapt it for another country. The camera database schema and ETL pipeline are designed to run anywhere Overpass API has data — which is most of the world.
          </Text>
          {[
            ['FastAPI + Python', 'REST API and routing logic'],
            ['Valhalla', 'Open-source routing engine (Linux Foundation)'],
            ['PostGIS + Supabase', 'Spatial camera database'],
            ['React Native + Expo', 'Cross-platform mobile and web app'],
            ['MapLibre GL', 'Open-source map rendering'],
          ].map(([tech, desc]) => (
            <View key={tech as string} style={styles.techRow}>
              <Text style={styles.techName}>{tech}</Text>
              <Text style={styles.techDesc}>{desc}</Text>
            </View>
          ))}
        </View>

        {/* Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Your privacy</Text>
          <Text style={styles.sectionTitle}>We collect nothing about you</Text>
          {[
            'No user accounts',
            'No route history stored',
            'No IP address logging',
            'No location tracking',
            'No cookies beyond what the browser requires',
          ].map(item => (
            <View key={item} style={styles.checkRow}>
              <Text style={styles.checkMark}>✓</Text>
              <Text style={styles.checkText}>{item}</Text>
            </View>
          ))}
          <Text style={[styles.body, { marginTop: 12 }]}>
            Vercel Analytics collects aggregate page view counts — no individual user data. You can verify this in the source code.{' '}
            <Text style={styles.link} onPress={() => navigate('/privacy')}>Full privacy policy →</Text>
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Fourth Route is a free, open-source public interest project.</Text>
          <Text style={styles.footerText}>AGPL-3.0 License · Camera data: OpenStreetMap (ODbL) + public records</Text>
          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={() => navigate('/privacy')}>
              <Text style={styles.footerLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <TouchableOpacity onPress={() => navigate('/terms')}>
              <Text style={styles.footerLink}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <TouchableOpacity onPress={() => navigate('/contact')}>
              <Text style={styles.footerLink}>Contact</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://github.com/bthornley/fourth-route')}>
              <Text style={styles.footerLink}>GitHub</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d1e', minHeight: '100vh' as any },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e1e3a', backgroundColor: '#0d0d1edd' },
  navBack: {},
  navBackText: { color: '#E8C97A', fontSize: 14, fontWeight: '600' },
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navLink: { color: '#666', fontSize: 12 },
  navDot: { color: '#333', fontSize: 12 },

  scroll: { flex: 1 },
  content: { maxWidth: 720, alignSelf: 'center', width: '100%', paddingHorizontal: 24, paddingBottom: 60 },

  hero: { alignItems: 'center', paddingTop: 64, paddingBottom: 48 },
  heroEmoji: { fontSize: 48, marginBottom: 12 },
  heroTitle: { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: 0.5, marginBottom: 10, textAlign: 'center' },
  heroTagline: { color: '#E8C97A', fontSize: 16, fontWeight: '500', textAlign: 'center', marginBottom: 28, lineHeight: 24 },
  heroBtn: { backgroundColor: '#E8C97A', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  heroBtnText: { color: '#0d0d1e', fontSize: 15, fontWeight: '700' },
  heroSub: { color: '#666', fontSize: 13, textAlign: 'center', marginBottom: 24 },

  divider: { height: 1, backgroundColor: '#1e1e3a', marginVertical: 8 },

  section: { marginVertical: 32 },
  sectionLabel: { color: '#E8C97A', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  sectionTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16, lineHeight: 30 },
  body: { color: '#aaa', fontSize: 15, lineHeight: 24, marginBottom: 12 },
  highlight: { color: '#fff', fontWeight: '600' },
  code: { color: '#7dd3fc', fontFamily: 'monospace' },
  link: { color: '#E8C97A', textDecorationLine: 'underline' },

  exampleCard: { backgroundColor: '#111127', borderWidth: 1, borderColor: '#2a2a4a', borderRadius: 16, padding: 24, marginVertical: 8 },
  exampleLabel: { color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  exampleRoute: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 20 },
  exampleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 16 },
  exampleStat: { alignItems: 'center', flex: 1 },
  exampleNum: { color: '#fff', fontSize: 28, fontWeight: '800' },
  exampleDesc: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 4 },
  exampleArrow: { paddingHorizontal: 4 },
  exampleArrowText: { color: '#333', fontSize: 20 },
  exampleFootnote: { color: '#555', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  bullet: { backgroundColor: '#111127', borderLeftWidth: 2, borderLeftColor: '#E8C97A', paddingLeft: 14, paddingVertical: 10, marginBottom: 10, borderRadius: 4 },
  bulletLabel: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  bulletDesc: { color: '#888', fontSize: 13 },

  personCard: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, backgroundColor: '#111127', borderRadius: 12, padding: 14, gap: 12 },
  personIcon: { fontSize: 22, marginTop: 1 },
  personDesc: { color: '#aaa', fontSize: 14, lineHeight: 20, flex: 1 },
  stateCard:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, backgroundColor: '#111127', borderRadius: 12, padding: 14, gap: 12, borderLeftWidth: 3, borderLeftColor: '#E8C97A' },
  stateIcon:  { color: '#E8C97A', fontSize: 14, fontWeight: '700', minWidth: 90 },
  stateDesc:  { color: '#aaa', fontSize: 13, lineHeight: 20, flex: 1 },

  techRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e1e3a', paddingVertical: 10, gap: 12 },
  techName: { color: '#7dd3fc', fontSize: 13, fontWeight: '600', width: 160 },
  techDesc: { color: '#666', fontSize: 13, flex: 1 },

  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  checkMark: { color: '#4ade80', fontSize: 15, fontWeight: '700' },
  checkText: { color: '#aaa', fontSize: 14 },

  footer: { marginTop: 48, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#1e1e3a', alignItems: 'center', gap: 8 },
  footerText: { color: '#444', fontSize: 12, textAlign: 'center' },
  footerLinks: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  footerLink: { color: '#555', fontSize: 12 },
  footerDot: { color: '#333', fontSize: 12 },
});
