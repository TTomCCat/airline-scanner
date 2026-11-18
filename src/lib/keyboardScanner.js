// Support for USB / Bluetooth barcode scanners in "keyboard" mode (e.g. Honeywell
// Voyager / Xenon). They type the barcode text very fast, then press Enter (or Tab).
// We tell a scanner apart from a human by typing speed.
import { useEffect, useRef } from 'react';

const MAX_AVG_GAP_MS = 40; // scanners: ~1–20 ms per char; humans: 80+ ms
const RESET_GAP_MS = 300; // a pause this long starts a new scan
const MIN_LENGTH = 20;
const IDLE_SUBMIT_MS = 300; // for scanners configured without an Enter suffix
const IDLE_MIN_LENGTH = 60;

export class KeyboardWedge {
  constructor() {
    this.reset();
  }

  reset() {
    this.buffer = '';
    this.first = 0;
    this.last = 0;
  }

  /** Feed one key. Returns the scanned text when a scan completes, else null. */
  key(key, time) {
    if (this.buffer && time - this.last > RESET_GAP_MS) this.reset();

    if (key === 'Enter' || key === 'Tab') {
      return this.flush(MIN_LENGTH);
    }
    if (key === 'Backspace') {
      this.buffer = this.buffer.slice(0, -1); // IMEs (Unikey/EVKey) send these
      this.last = time;
      return null;
    }
    if (key.length === 1) {
      if (!this.buffer) this.first = time;
      this.buffer += key;
      this.last = time;
    }
    return null;
  }

  /** Return the buffer if it was typed fast enough to be a scanner, then clear it. */
  flush(minLength = MIN_LENGTH) {
    const text = this.buffer;
    const avgGap = text.length > 1 ? (this.last - this.first) / (text.length - 1) : Infinity;
    this.reset();
    return text.length >= minLength && avgGap <= MAX_AVG_GAP_MS ? text : null;
  }

  get scanning() {
    return this.buffer.length > 0;
  }
}

function isEditable(el) {
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
}

/**
 * Listen for a keyboard-mode barcode scanner while `enabled`.
 * Ignored while the user is typing in a text field.
 */
export function useKeyboardScanner(onScan, enabled = true) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return undefined;
    const wedge = new KeyboardWedge();
    let idleTimer;

    function onKeyDown(e) {
      if (isEditable(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
      const midScan = wedge.scanning;
      const text = wedge.key(e.key, e.timeStamp);
      clearTimeout(idleTimer);

      if (text) {
        e.preventDefault(); // don't let the final Enter/Tab click or move focus
        onScanRef.current(text);
        return;
      }
      // Mid-scan: stop Space from scrolling / pressing a focused button
      if (midScan && e.key.length === 1) e.preventDefault();
      if (wedge.scanning) {
        idleTimer = setTimeout(() => {
          const t = wedge.flush(IDLE_MIN_LENGTH);
          if (t) onScanRef.current(t);
        }, IDLE_SUBMIT_MS);
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled]);
}
