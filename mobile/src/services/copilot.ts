/**
 * copilot.ts — 100% client-side foreground dash copilot helpers.
 * All GPS coordinates stay strictly in browser memory and are never transmitted
 * to any server. Works while Fourth Route remains open in the foreground.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

/** Play a brief 2-tone Web Audio oscillator chime. */
function playTonePair(freqA: number, freqB: number, durationMs = 130): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const stepS = durationMs / 1000;

    [
      { freq: freqA, start: now },
      { freq: freqB, start: now + stepS * 0.9 },
    ].forEach(({ freq, start }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.24, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + stepS);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + stepS + 0.02);
    });
  } catch {}
}

/** Unlock browser audio on user gesture (required by iOS Safari) with soft feedback chime. */
export function unlockCopilotAudio(): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    playTonePair(523.25, 659.25, 100);
    return true;
  } catch {
    return false;
  }
}

/** Play an alert chime and optionally speak camera distance. */
export function triggerCameraAlert(distanceMeters: number, voiceEnabled: boolean): void {
  playTonePair(880, 1174.66, 150);
  if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const feet = Math.max(50, Math.round((distanceMeters * 3.28084) / 50) * 50);
    const msg = new SpeechSynthesisUtterance(`License plate camera within ${feet} feet`);
    msg.rate = 1.05;
    msg.pitch = 1.0;
    window.speechSynthesis.speak(msg);
  } catch {}
}

export interface WakeLockController {
  release: () => Promise<void>;
}

/** Request Screen Wake Lock so phone screens stay lit on a dash mount while supported. */
export async function acquireScreenWakeLock(): Promise<WakeLockController | null> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return null;
  try {
    const sentinel = await (navigator as any).wakeLock.request('screen');
    return {
      release: async () => {
        try {
          await sentinel.release();
        } catch {}
      },
    };
  } catch {
    return null;
  }
}

/** Haversine distance in meters between two WGS84 coordinates. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
