// Beep + vibration after a scan, so the agent doesn't have to look at the screen.
//   ok   — one short high beep
//   warn — two beeps (duplicate seat / name on this flight)
//   err  — one low buzz (couldn't read the pass)
import { getSetting } from './settings.js';

let ctx;
function audio() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(ac, freq, start, dur, type = 'sine') {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const PATTERNS = {
  ok: { tones: [[1320, 0, 0.12]], vibrate: 60 },
  warn: { tones: [[880, 0, 0.12], [880, 0.18, 0.12]], vibrate: [80, 60, 80] },
  err: { tones: [[220, 0, 0.3, 'square']], vibrate: 250 },
};

/** Play the feedback for `kind` ('ok' | 'warn' | 'err'). Never throws. */
export function scanFeedback(kind) {
  const p = PATTERNS[kind] || PATTERNS.ok;
  try {
    navigator.vibrate?.(p.vibrate);
  } catch {
    /* not supported */
  }
  if (!getSetting('sound')) return;
  try {
    const ac = audio();
    if (ac) for (const [f, s, d, type] of p.tones) tone(ac, f, s, d, type);
  } catch {
    /* audio blocked — ignore */
  }
}
