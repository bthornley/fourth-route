import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Modal, ActivityIndicator,
} from 'react-native';

const OPERATORS = [
  'Flock Safety',
  'Motorola',
  'Rekor',
  'Genetec',
  'Other',
  'Unknown',
];

interface Props {
  visible: boolean;
  lat: number;
  lon: number;
  onSubmit: (lat: number, lon: number, operator?: string, notes?: string) => Promise<void>;
  onClose: () => void;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

export function CameraReportModal({ visible, lat, lon, onSubmit, onClose }: Props) {
  const [operator, setOperator] = useState('');
  const [customOperator, setCustomOperator] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const effectiveOperator = operator === 'Other' ? customOperator : operator;

  const reset = () => {
    setOperator('');
    setCustomOperator('');
    setNotes('');
    setStatus('idle');
    setErrorMsg('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setStatus('loading');
    try {
      await onSubmit(lat, lon, effectiveOperator || undefined, notes || undefined);
      setStatus('success');
      setTimeout(() => {
        handleClose();
      }, 1800);
    } catch (e) {
      setStatus('error');
      setErrorMsg('Failed to submit — please try again.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>📷 Report ALPR Camera</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Location */}
          <View style={styles.locationRow}>
            <Text style={styles.locationLabel}>Location</Text>
            <Text style={styles.locationCoords}>
              {lat.toFixed(5)}, {lon.toFixed(5)}
            </Text>
          </View>

          {status === 'success' ? (
            <View style={styles.successBox}>
              <Text style={styles.successEmoji}>✓</Text>
              <Text style={styles.successText}>Camera reported — thank you!</Text>
              <Text style={styles.successSub}>It will be reviewed and added to the database.</Text>
            </View>
          ) : (
            <>
              {/* Operator chips */}
              <Text style={styles.fieldLabel}>Camera operator</Text>
              <View style={styles.chipRow}>
                {OPERATORS.map(op => (
                  <TouchableOpacity
                    key={op}
                    style={[styles.chip, operator === op && styles.chipActive]}
                    onPress={() => setOperator(prev => prev === op ? '' : op)}
                  >
                    <Text style={[styles.chipText, operator === op && styles.chipTextActive]}>
                      {op}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {operator === 'Other' && (
                <TextInput
                  style={styles.input}
                  placeholder="Enter operator name…"
                  placeholderTextColor="#555"
                  value={customOperator}
                  onChangeText={setCustomOperator}
                  autoFocus
                />
              )}

              {/* Notes */}
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="e.g. mounted on pole, faces eastbound traffic…"
                placeholderTextColor="#555"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />

              {status === 'error' && (
                <Text style={styles.errorText}>{errorMsg}</Text>
              )}

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, status === 'loading' && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={status === 'loading'}
                >
                  {status === 'loading'
                    ? <ActivityIndicator color="#0d0d1e" size="small" />
                    : <Text style={styles.submitText}>Submit Report</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: '#111127',
    borderRadius: 18,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  closeBtn: { padding: 4 },
  closeX: { color: '#555', fontSize: 16 },

  locationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0d0d1e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 18,
  },
  locationLabel: { color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  locationCoords: { color: '#7dd3fc', fontSize: 12, fontFamily: 'monospace' as any },

  fieldLabel: { color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
    borderColor: '#2a2a4a', backgroundColor: '#1a1a2e',
  },
  chipActive: { borderColor: '#E8C97A', backgroundColor: '#E8C97A22' },
  chipText: { color: '#666', fontSize: 12 },
  chipTextActive: { color: '#E8C97A', fontWeight: '600' },

  input: {
    backgroundColor: '#0d0d1e',
    borderWidth: 1, borderColor: '#2a2a4a',
    borderRadius: 10, color: '#fff',
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, marginTop: 8,
    outlineStyle: 'none' as any,
  },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },

  errorText: { color: '#f87171', fontSize: 13, marginTop: 10 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#2a2a4a',
    alignItems: 'center',
  },
  cancelText: { color: '#666', fontSize: 14 },
  submitBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#E8C97A', alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#0d0d1e', fontSize: 14, fontWeight: '700' },

  successBox: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  successEmoji: { fontSize: 36, color: '#4ade80' },
  successText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  successSub: { color: '#666', fontSize: 13, textAlign: 'center' },
});
