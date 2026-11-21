// Pure helpers for the Saved page: grouping by flight and filtering.
import { flightKey } from './db.js';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Group tickets by flight number + date.
 * Upcoming flights first (soonest first), then past flights (latest first).
 * Inside a group: most recently saved first.
 */
export function groupByFlight(tickets, now = today()) {
  const map = new Map();
  for (const t of tickets) {
    const key = flightKey(t);
    let g = map.get(key);
    if (!g) {
      g = { key, flight: t.flight, flightDate: t.flightDate, from: t.from, to: t.to, tickets: [] };
      map.set(key, g);
    }
    g.tickets.push(t);
  }
  const groups = [...map.values()];
  for (const g of groups) g.tickets.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

  const d = (g) => g.flightDate || '';
  const upcoming = groups.filter((g) => d(g) >= now).sort((a, b) => d(a).localeCompare(d(b)) || a.key.localeCompare(b.key));
  const past = groups.filter((g) => !(d(g) >= now)).sort((a, b) => d(b).localeCompare(d(a)) || a.key.localeCompare(b.key));
  return [...upcoming, ...past];
}

/** Lowercase, strip accents (đ → d) and spaces, for forgiving text matching. */
export function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** Searchable flight text: "VN 0213" matches "vn0213", "vn213", "0213" and "213". */
function flightHaystack(t) {
  const f = fold(t.flight);
  return `${f}|${f.replace(/^([a-z0-9]{2})0+(?=\d)/, '$1')}`;
}

export const EMPTY_FILTERS = { flight: '', seat: '', flightDate: '', name: '', savedFrom: '', savedTo: '' };

export function hasFilters(f) {
  return Object.values(f).some((v) => v);
}

/**
 * Filter tickets.
 * flight / seat / name: substring, case-, accent- and space-insensitive.
 * flightDate: exact YYYY-MM-DD.
 * savedFrom / savedTo: `datetime-local` strings ("2026-11-21T08:00"), inclusive.
 */
export function filterTickets(tickets, f) {
  const flight = fold(f.flight);
  const seat = fold(f.seat);
  const name = fold(f.name);
  const from = f.savedFrom ? new Date(f.savedFrom).getTime() : null;
  // datetime-local has minute precision: include the whole "to" minute
  const to = f.savedTo ? new Date(f.savedTo).getTime() + 59_999 : null;

  return tickets.filter(
    (t) =>
      (!flight || flightHaystack(t).includes(flight)) &&
      (!seat || fold(t.seat).includes(seat)) &&
      (!name || fold(t.name).includes(name)) &&
      (!f.flightDate || t.flightDate === f.flightDate) &&
      (from === null || t.savedAt >= from) &&
      (to === null || t.savedAt <= to),
  );
}
