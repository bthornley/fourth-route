import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';

interface Props {
  navigate: (path: string) => void;
}

export function PrivacyPolicy({ navigate }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigate('/')} style={styles.navBack}>
          <Text style={styles.navBackText}>← Map</Text>
        </TouchableOpacity>
        <View style={styles.navLinks}>
          <TouchableOpacity onPress={() => navigate('/about')}>
            <Text style={styles.navLink}>About</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => navigate('/terms')}>
            <Text style={styles.navLink}>Terms</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => navigate('/contact')}>
            <Text style={styles.navLink}>Contact</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: September 2026</Text>

        <Text style={styles.lead}>
          Fourth Route is built specifically to protect your privacy. We do not collect, store, or share personal information about you. This policy explains exactly what data exists and where it goes.
        </Text>

        <Section title="What we do not collect">
          <Body>Fourth Route does not collect or retain:</Body>
          {[
            'Your name, email address, or any account information (no accounts exist)',
            'Your location history or ongoing GPS tracking',
            'Your route history or search queries',
            'Your IP address in our database or application logs',
            'Cookies or persistent tracking identifiers',
            'Device fingerprints or advertising identifiers',
          ].map(item => <Check key={item} text={item} />)}
        </Section>

        <Section title="Route calculations & geocoding">
          <Body>
            When you request a route, your origin and destination coordinates are sent to our API server (hosted on Railway, US region) to compute the route with our Valhalla engine. These coordinates are processed ephemerally in memory solely to calculate and return the navigation geometry. They are never written to disk, stored in a database, or linked to any user identifier.
          </Body>
          <Body>
            When you search for an address, the query is proxied through our own backend with rounded coordinates and memory-only caching so your browser never connects directly to third-party geocoding providers.
          </Body>
        </Section>

        <Section title="Analytics">
          <Body>
            The web app includes Vercel Analytics and Speed Insights. These services collect <Bold>aggregate, anonymous metrics only</Bold> — page view counts, referrer sites, country/region level aggregates, and performance timing. No cookies are used, no individual user sessions are tracked across the web, and no GPS or route data is ever transmitted to analytics. You can review Vercel's privacy policy at{' '}
            <Anchor url="https://vercel.com/legal/privacy-policy">vercel.com/legal/privacy-policy</Anchor>.
          </Body>
        </Section>

        <Section title="Camera database">
          <Body>
            The ALPR camera locations displayed in the app come from public sources:
          </Body>
          {[
            'OpenStreetMap (openstreetmap.org) — community-contributed geographic data, licensed under ODbL',
            'Public records and FOIA responses from government agencies',
          ].map(item => <Check key={item} text={item} />)}
          <Body>
            No private or proprietary surveillance data is used. The camera database is itself publicly available — anyone can download the raw data from the OpenStreetMap Overpass API.
          </Body>
        </Section>

        <Section title="In-app camera reports">
          <Body>
            If you use the long-press feature to report a camera location, the coordinates, operator name, and notes you enter are submitted to our API and stored in the camera database for human moderation. No personal identifier, IP address, or user account is associated with the report. Automated alert notifications may be transmitted to administrators via Resend or webhooks.
          </Body>
        </Section>

        <Section title="Third-party services">
          <Body>The app relies on the following third-party infrastructure:</Body>
          {[
            ['Vercel', 'Frontend hosting, edge CDN, and aggregate anonymous analytics — vercel.com/legal/privacy-policy'],
            ['Railway', 'API backend and Valhalla routing engine hosting — railway.app/legal/privacy'],
            ['Supabase', 'Managed PostgreSQL / PostGIS database (stores public camera locations only) — supabase.com/privacy'],
            ['OpenFreeMap', 'Open-source vector map tiles and style hosting — openfreemap.org'],
            ['Nominatim / OpenStreetMap', 'Geocoding queries (proxied server-side via our API) — openstreetmap.org/privacy'],
            ['Web3Forms', 'Contact and feedback message delivery on the /contact page — web3forms.com/privacy'],
            ['Resend', 'Optional administrative alert delivery for community camera reports — resend.com/privacy'],
          ].map(([name, desc]) => (
            <View key={name as string} style={styles.thirdPartyRow}>
              <Text style={styles.thirdPartyName}>{name}</Text>
              <Text style={styles.thirdPartyDesc}>{desc}</Text>
            </View>
          ))}
        </Section>

        <Section title="Open source">
          <Body>
            Fourth Route is fully open source under the <Bold>GNU Affero General Public License v3 (AGPL-3.0)</Bold>. You can review every line of code — including exactly what data the API accepts and discards — at{' '}
            <Anchor url="https://github.com/bthornley/fourth-route">github.com/bthornley/fourth-route</Anchor>.
            The privacy claims in this policy are verifiable in the source code.
          </Body>
        </Section>

        <Section title="Changes to this policy">
          <Body>
            If this policy changes materially, the updated date at the top of this page will reflect it. Given the open-source nature of the project, all changes are also visible in the GitHub commit history.
          </Body>
        </Section>

        <Section title="Contact">
          <Body>
            Questions about this privacy policy:{' '}
            <Text style={styles.link} onPress={() => navigate('/contact')}>Contact Form →</Text>
          </Body>
        </Section>

        <View style={styles.footer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => navigate('/terms')}>
              <Text style={styles.footerLink}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={styles.navDot}>·</Text>
            <TouchableOpacity onPress={() => navigate('/contact')}>
              <Text style={styles.footerLink}>Contact Form →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

function Bold({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

function Anchor({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <Text style={styles.link} onPress={() => Linking.openURL(url)}>{children}</Text>
  );
}

function Check({ text }: { text: string }) {
  return (
    <View style={styles.checkRow}>
      <Text style={styles.checkMark}>✓</Text>
      <Text style={styles.checkText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d1e', minHeight: '100vh' as any },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e1e3a' },
  navBack: {},
  navBackText: { color: '#E8C97A', fontSize: 14, fontWeight: '600' },
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navLink: { color: '#666', fontSize: 12 },
  navDot: { color: '#333', fontSize: 12 },

  scroll: { flex: 1 },
  content: { maxWidth: 680, alignSelf: 'center', width: '100%', paddingHorizontal: 24, paddingBottom: 60 },

  pageTitle: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 40, marginBottom: 6 },
  updated: { color: '#444', fontSize: 12, marginBottom: 24 },
  lead: { color: '#aaa', fontSize: 16, lineHeight: 26, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: '#E8C97A', paddingLeft: 14 },

  section: { marginTop: 36 },
  sectionTitle: { color: '#E8C97A', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase' },
  body: { color: '#aaa', fontSize: 15, lineHeight: 24, marginBottom: 10 },
  bold: { color: '#fff', fontWeight: '600' },
  link: { color: '#7dd3fc', textDecorationLine: 'underline' },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 10 },
  checkMark: { color: '#4ade80', fontSize: 14, fontWeight: '700', marginTop: 2 },
  checkText: { color: '#aaa', fontSize: 14, flex: 1, lineHeight: 20 },

  thirdPartyRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1e1e3a' },
  thirdPartyName: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  thirdPartyDesc: { color: '#555', fontSize: 12 },

  footer: { marginTop: 48, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#1e1e3a', alignItems: 'center' },
  footerLink: { color: '#E8C97A', fontSize: 13 },
});
