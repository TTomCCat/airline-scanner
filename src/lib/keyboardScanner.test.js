import { describe, it, expect } from 'vitest';
import { KeyboardWedge } from './keyboardScanner.js';

const PASS = 'M1DOE/JOHN MR         EABC123 SGNKULMH 0759 322Y026D0010 100';

function type(wedge, text, gapMs, start = 1000) {
  let t = start;
  let out = null;
  for (const ch of text) {
    out = wedge.key(ch, t) ?? out;
    t += gapMs;
  }
  return { out, t };
}

describe('KeyboardWedge', () => {
  it('accepts fast typing ending in Enter (a scanner)', () => {
    const w = new KeyboardWedge();
    const { t } = type(w, PASS, 5);
    expect(w.key('Enter', t)).toBe(PASS);
  });

  it('accepts Tab as the end of a scan', () => {
    const w = new KeyboardWedge();
    const { t } = type(w, PASS, 8);
    expect(w.key('Tab', t)).toBe(PASS);
  });

  it('ignores slow human typing', () => {
    const w = new KeyboardWedge();
    const { t } = type(w, PASS, 120);
    expect(w.key('Enter', t)).toBeNull();
  });

  it('ignores short bursts', () => {
    const w = new KeyboardWedge();
    const { t } = type(w, 'hello', 5);
    expect(w.key('Enter', t)).toBeNull();
  });

  it('starts over after a pause', () => {
    const w = new KeyboardWedge();
    const { t } = type(w, 'stray keys', 5);
    const second = type(w, PASS, 5, t + 1000);
    expect(w.key('Enter', second.t)).toBe(PASS);
  });

  it('handles Backspace (IME corrections)', () => {
    const w = new KeyboardWedge();
    const { t } = type(w, PASS + 'x', 5);
    w.key('Backspace', t);
    expect(w.key('Enter', t + 5)).toBe(PASS);
  });

  it('flush() supports scanners with no Enter suffix', () => {
    const w = new KeyboardWedge();
    type(w, PASS, 5);
    expect(w.flush(60)).toBe(PASS);
    expect(w.scanning).toBe(false);
  });
});
