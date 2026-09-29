import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';

interface Props {
  navigate: (path: string) => void;
}

const INQUIRY_TOPICS = [
  'General Inquiry',
  'Commercial Licensing',
  'Privacy & Data Question',
  'Bug Report / Feedback',
];

const WEB3FORMS_ACCESS_KEY = '46e61cbc-cc2f-4bbf-96d9-2750589cf141';

export function ContactPage({ navigate }: Props) {
  const [topic, setTopic] = useState<string>(INQUIRY_TOPICS[0]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (!trimmedEmail) {
      setErrorMessage('Please provide an email address so we can reply to you.');
      return;
    }
    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!trimmedMessage) {
      setErrorMessage('Please enter a message before sending.');
      return;
    }

    setSubmitting(true);

    try {
      const subjectLine = customSubject.trim()
        ? `[Fourth Route] ${topic}: ${customSubject.trim()}`
        : `[Fourth Route] ${topic}`;

      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          name: name.trim() || 'Anonymous Driver',
          email: trimmedEmail,
          subject: subjectLine,
          message: trimmedMessage,
          from_name: 'Fourth Route App',
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSubmitted(true);
      } else {
        setErrorMessage(result.message || 'Failed to send message. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage('Network error occurred. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Navigation */}
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
            <Text style={styles.navLink}>Privacy</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => navigate('/terms')}>
            <Text style={styles.navLink}>Terms</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://github.com/bthornley/fourth-route')}>
            <Text style={styles.navLink}>GitHub ↗</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {submitted ? (
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Message Sent</Text>
            <Text style={styles.successBody}>
              Thank you for reaching out. Your message has been delivered to the Fourth Route project maintainers. We usually reply within 24–48 hours.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => navigate('/')}>
              <Text style={styles.primaryButtonText}>Return to Map →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.pageTitle}>Contact Fourth Route</Text>
            <Text style={styles.subtitle}>
              Questions about privacy, commercial licensing, bug reports, or general inquiries.
            </Text>

            {errorMessage && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
              </View>
            )}

            {/* Topic Chips */}
            <Text style={styles.fieldLabel}>What is your inquiry about?</Text>
            <View style={styles.topicRow}>
              {INQUIRY_TOPICS.map((t) => {
                const active = t === topic;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.topicChip, active && styles.topicChipActive]}
                    onPress={() => setTopic(t)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.topicChipText, active && styles.topicChipTextActive]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Name */}
            <Text style={styles.fieldLabel}>Your Name (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Alex Smith"
              placeholderTextColor="#555"
              value={name}
              onChangeText={setName}
            />

            {/* Email */}
            <Text style={styles.fieldLabel}>
              Your Email <Text style={styles.requiredAsterisk}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="name@example.com"
              placeholderTextColor="#555"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            {/* Subject Detail */}
            <Text style={styles.fieldLabel}>Subject (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Brief summary of your question"
              placeholderTextColor="#555"
              value={customSubject}
              onChangeText={setCustomSubject}
            />

            {/* Message */}
            <Text style={styles.fieldLabel}>
              Message <Text style={styles.requiredAsterisk}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Write your message here..."
              placeholderTextColor="#555"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              value={message}
              onChangeText={setMessage}
            />

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#0d0d1e" />
              ) : (
                <Text style={styles.submitButtonText}>Send Message</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.privacyNote}>
              🔒 We never sell or share contact info. Messages are sent securely to our team inbox.
            </Text>
          </>
        )}
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
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navLink: { color: '#666', fontSize: 12 },
  navDot: { color: '#333', fontSize: 12 },

  scroll: { flex: 1 },
  content: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 60,
  },

  pageTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 14, lineHeight: 22, marginBottom: 28 },

  fieldLabel: {
    color: '#bbb',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 18,
  },
  requiredAsterisk: { color: '#E8C97A' },

  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  topicChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#13132a',
    borderWidth: 1,
    borderColor: '#222244',
  },
  topicChipActive: {
    backgroundColor: '#E8C97A22',
    borderColor: '#E8C97A',
  },
  topicChipText: { color: '#777', fontSize: 12, fontWeight: '500' },
  topicChipTextActive: { color: '#E8C97A', fontWeight: '700' },

  input: {
    backgroundColor: '#111127',
    borderWidth: 1,
    borderColor: '#222244',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
  },
  textArea: {
    minHeight: 130,
    paddingTop: 12,
  },

  submitButton: {
    backgroundColor: '#E8C97A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#0d0d1e', fontSize: 15, fontWeight: '700' },

  privacyNote: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 18,
  },

  errorBox: {
    backgroundColor: '#3b1818',
    borderWidth: 1,
    borderColor: '#7a2d2d',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: '#fca5a5', fontSize: 13 },

  successCard: {
    backgroundColor: '#111127',
    borderWidth: 1,
    borderColor: '#2a2a4a',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginTop: 40,
  },
  successIcon: {
    fontSize: 48,
    color: '#4ade80',
    marginBottom: 16,
  },
  successTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  successBody: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#E8C97A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  primaryButtonText: { color: '#0d0d1e', fontSize: 14, fontWeight: '700' },
});
