// Small on/off preferences, remembered per device.
import { useSyncExternalStore } from 'react';

const DEFAULTS = {
  sound: true, // beep after each scan
  keepScanning: false, // save every scan straight away, camera stays on
  theme: 'auto', // 'auto' (follow the device) | 'light' | 'dark'
};
const PREFIX = 'setting:';
const listeners = new Set();
const cache = {};

export function getSetting(key) {
  if (!(key in cache)) {
    let v = DEFAULTS[key];
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw !== null) v = JSON.parse(raw);
    } catch {
      /* storage blocked: use default */
    }
    cache[key] = v;
  }
  return cache[key];
}

export function setSetting(key, value) {
  cache[key] = value;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** [value, setValue] for one setting; re-renders when it changes anywhere. */
export function useSetting(key) {
  const value = useSyncExternalStore(subscribe, () => getSetting(key), () => DEFAULTS[key]);
  return [value, (v) => setSetting(key, v)];
}
