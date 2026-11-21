// Tiny i18n: Vietnamese / English, remembered per device.
// `t()` works anywhere (also outside React); `useT()` re-renders a component when the language changes.
import { useSyncExternalStore } from 'react';
import { STRINGS } from './strings.js';

export const LANGS = ['vi', 'en'];
const KEY = 'lang';

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {
    /* storage blocked: fall back to default */
  }
  return 'vi';
}

let lang = initial();
const listeners = new Set();

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  listeners.forEach((l) => l());
}

/** Locale for dates and numbers. */
export function locale() {
  return lang === 'vi' ? 'vi-VN' : 'en-GB';
}

/**
 * Translate a key, filling {placeholders} from `vars`. Unknown keys fall back to Vietnamese, then the key.
 * When vars.n === 1 and a `<key>_one` string exists, it is used (English singulars).
 */
export function t(key, vars) {
  const table = STRINGS[lang];
  const s = (vars?.n === 1 && table[`${key}_one`]) || table[key] || STRINGS.vi[key] || key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Subscribe the component to language changes. Returns { t, lang, setLang }. */
export function useT() {
  const current = useSyncExternalStore(subscribe, getLang, getLang);
  return { t, lang: current, setLang };
}

if (typeof document !== 'undefined') document.documentElement.lang = lang;
