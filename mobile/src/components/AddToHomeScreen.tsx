import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { track } from '@vercel/analytics';

export function AddToHomeScreen() {
  const [visible, setVisible] = useState(false);
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'other'>('other');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already running in standalone mode (PWA installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    if (isStandalone) return;

    // Check if dismissed in this session
    try {
      if (sessionStorage.getItem('fourth_route_pwa_dismissed') === '1') {
        return;
      }
    } catch {}

    // Only show on mobile / small screen devices
    const isMobileDevice =
      window.innerWidth <= 768 ||
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (!isMobileDevice) return;

    // Determine OS
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua) && !(window as any).MSStream;
    const isAndroid = /Android/i.test(ua);

    if (isIOS) {
      setDeviceType('ios');
    } else if (isAndroid) {
      setDeviceType('android');
    } else {
      setDeviceType('other');
    }

    // Capture Android beforeinstallprompt if available
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Show banner after brief delay so it doesn't jar the user immediately
    const timer = setTimeout(() => {
      setVisible(true);
      try {
        track('pwa_banner_shown', { os: isIOS ? 'ios' : isAndroid ? 'android' : 'other' });
      } catch {}
    }, 2500);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem('fourth_route_pwa_dismissed', '1');
      track('pwa_banner_dismissed');
    } catch {}
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        try {
          track('pwa_banner_installed');
        } catch {}
      }
      setDeferredPrompt(null);
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Image
            source={{ uri: '/pwa/apple-touch-icon/apple-touch-icon-180.png' }}
            style={styles.iconImage}
          />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>Add Fourth Route to Home Screen</Text>
          {deviceType === 'ios' ? (
            <Text style={styles.instruction}>
              Tap <Text style={styles.highlight}>Share ⎋</Text> then select <Text style={styles.highlight}>Add to Home Screen ⊞</Text> for 1-tap navigation.
            </Text>
          ) : deferredPrompt ? (
            <Text style={styles.instruction}>
              Install app for fast 1-tap navigation & offline access.
            </Text>
          ) : (
            <Text style={styles.instruction}>
              Tap <Text style={styles.highlight}>Menu ⋮</Text> and select <Text style={styles.highlight}>Add to Home screen</Text>.
            </Text>
          )}
        </View>

        {deferredPrompt && (
          <TouchableOpacity style={styles.installBtn} onPress={handleInstallClick}>
            <Text style={styles.installBtnText}>Install</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute' as any,
    bottom: 72,
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16162eee',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#3a3a60',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  iconContainer: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconImage: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a60',
  },
  icon: {
    fontSize: 22,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  instruction: {
    color: '#bbb',
    fontSize: 11,
    lineHeight: 15,
  },
  highlight: {
    color: '#E8C97A',
    fontWeight: '600',
  },
  installBtn: {
    backgroundColor: '#4A90D9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  installBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
});
