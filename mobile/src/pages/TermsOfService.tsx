import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';

interface Props {
  navigate: (path: string) => void;
}

export function TermsOfService({ navigate }: Props) {
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
          <TouchableOpacity onPress={() => navigate('/privacy')}>
            <Text style={styles.navLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Terms of Service</Text>
        <Text style={styles.updated}>Last updated: September 2026</Text>

        <Text style={styles.lead}>
          Fourth Route is a free, open-source public interest project. These terms are intentionally plain. By using the app, you agree to them.
        </Text>

        <Section title="Free to use">
          <Body>
            Fourth Route is provided free of charge with no subscription, no account, and no payment required. We reserve the right to limit access if the service is abused, but have no plans to charge for access.
          </Body>
        </Section>

        <Section title="Open source license">
          <Body>
            The Fourth Route codebase is released under the <Bold>MIT License</Bold>. You are free to use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software, subject to the MIT License terms. The full license is available at{' '}
            <Anchor url="https://github.com/bthornley/fourth-route/blob/main/LICENSE">github.com/bthornley/fourth-route</Anchor>.
          </Body>
          <Body>
            Camera location data derived from OpenStreetMap is licensed under the <Bold>Open Database License (ODbL)</Bold>. Data from public records is in the public domain.
          </Body>
        </Section>

        <Section title="Camera data accuracy">
          <Body>
            The camera database is compiled from OpenStreetMap community contributions and public records. It may be incomplete, outdated, or contain errors. Cameras may have been removed, relocated, or added since the last sync.
          </Body>
          <Body>
            <Bold>Fourth Route does not guarantee that a privacy route avoids all ALPR cameras.</Bold> The database represents our best available data, not a verified ground-truth record. Use it as an informational tool, not as a guarantee of surveillance-free travel.
          </Body>
        </Section>

        <Section title="Not legal advice">
          <Body>
            Fourth Route provides navigational information only. Nothing in this app constitutes legal advice. If you have concerns about surveillance, data retention, or your legal rights, consult a qualified attorney or contact organizations such as the Electronic Frontier Foundation (eff.org) or the ACLU (aclu.org).
          </Body>
        </Section>

        <Section title="Lawful use only">
          <Body>
            You agree to use Fourth Route only for lawful purposes. The app is intended to help people exercise their right to travel without mass surveillance — not to facilitate illegal activity. Using route information to evade law enforcement during criminal conduct is not a permitted use.
          </Body>
        </Section>

        <Section title="Camera reporting">
          <Body>
            If you submit a camera report using the in-app reporting feature, you represent that the report is made in good faith based on your genuine observation. Do not submit false or misleading reports. Submitted reports may be reviewed and incorporated into the public camera database.
          </Body>
        </Section>

        <Section title="No warranty">
          <Body>
            Fourth Route is provided <Bold>"as is,"</Bold> without warranty of any kind, express or implied. We make no warranty that the service will be uninterrupted, error-free, or that route calculations are accurate for any particular use case.
          </Body>
          <Body>
            To the maximum extent permitted by applicable law, the authors and contributors of Fourth Route are not liable for any damages arising from use of the service, including routing errors, data inaccuracies, or service interruptions.
          </Body>
        </Section>

        <Section title="Service changes">
          <Body>
            Because Fourth Route is open source, even if this hosted instance is discontinued, the codebase remains available for anyone to fork and self-host. We will make reasonable efforts to provide advance notice of significant service changes.
          </Body>
        </Section>

        <Section title="Contact">
          <Body>
            Questions about these terms:{' '}
            <Anchor url="mailto:bthornley@gmail.com">bthornley@gmail.com</Anchor>
          </Body>
        </Section>

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => navigate('/privacy')}>
            <Text style={styles.footerLink}>← Privacy Policy</Text>
          </TouchableOpacity>
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

  footer: { marginTop: 48, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#1e1e3a', alignItems: 'center' },
  footerLink: { color: '#E8C97A', fontSize: 13 },
});
