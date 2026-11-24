// Friendly times for the Saved list: "now", "5 min ago", "3 hr ago", then "08:05 21/11".
import { useEffect, useState } from 'react';
import { locale } from './i18n.js';

const pad = (n) => String(n).padStart(2, '0');

/** 08:05 21/11 */
export function shortTime(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** Relative time under 12 hours, otherwise the short clock + date. */
export function relTime(ms, now = Date.now(), loc = locale()) {
  const sec = Math.round((now - ms) / 1000);
  if (sec < 45) return new Intl.RelativeTimeFormat(loc, { numeric: 'auto' }).format(0, 'second');
  const min = Math.round(sec / 60);
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'always', style: 'short' });
  if (min < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (hr < 12) return rtf.format(-hr, 'hour');
  return shortTime(ms);
}

/** Current time that refreshes every `ms`, so relative times stay correct. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
