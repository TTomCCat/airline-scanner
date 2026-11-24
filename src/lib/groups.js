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

/**
 * Tickets that share a seat or a name with another ticket on the same flight (number + date).
 * Returns Map<id, { seat: boolean, name: boolean }>. Empty seat / name never match.
 */
export function findDuplicates(tickets) {
  const keys = (t) => {
    const f = flightKey(t);
    const seat = fold(t.seat);
    const name = fold(t.name);
    return { seat: seat && `s|${f}|${seat}`, name: name && `n|${f}|${name}` };
  };
  const count = new Map();
  for (const t of tickets) {
    for (const k of Object.values(keys(t))) if (k) count.set(k, (count.get(k) || 0) + 1);
  }
  const out = new Map();
  for (const t of tickets) {
    const k = keys(t);
    const seat = Boolean(k.seat) && count.get(k.seat) > 1;
    const name = Boolean(k.name) && count.get(k.name) > 1;
    if (seat || name) out.set(t.id, { seat, name });
  }
  return out;
}

/** Saved tickets on the same flight as `candidate` that share its seat or name → [{ ticket, seat, name }]. */
export function matchesFor(candidate, tickets) {
  const f = flightKey(candidate);
  const seat = fold(candidate.seat);
  const name = fold(candidate.name);
  return tickets
    .filter((t) => flightKey(t) === f)
    .map((t) => ({ ticket: t, seat: Boolean(seat) && fold(t.seat) === seat, name: Boolean(name) && fold(t.name) === name }))
    .filter((m) => m.seat || m.name);
}

export const EMPTY_FILTERS = { q: '', flight: '', seat: '', flightDate: '', name: '', savedFrom: '', savedTo: '', dupOnly: false };

/** Letters and digits only, for the quick search ("nguyen van" matches "NGUYEN/VAN A"). */
const alnum = (s) => fold(s).replace(/[^a-z0-9]/g, '');

/** Quick search: one box that matches name, seat, flight or booking ref. */
function matchesQuery(t, q) {
  return [t.name, t.seat, t.pnr].some((v) => alnum(v).includes(q)) || flightHaystack(t).includes(q);
}

export function hasFilters(f) {
  return Object.values(f).some((v) => v);
}

/**
 * Filter tickets.
 * q: quick search over name / seat / flight / PNR (letters and digits only).
 * flight / seat / name: substring, case-, accent- and space-insensitive.
 * flightDate: exact YYYY-MM-DD.
 * savedFrom / savedTo: `datetime-local` strings ("2026-11-21T08:00"), inclusive.
 * dupOnly: keep only tickets in `dups` (from findDuplicates over all tickets).
 */
export function filterTickets(tickets, f, dups = findDuplicates(tickets)) {
  const q = alnum(f.q);
  const flight = fold(f.flight);
  const seat = fold(f.seat);
  const name = fold(f.name);
  const from = f.savedFrom ? new Date(f.savedFrom).getTime() : null;
  // datetime-local has minute precision: include the whole "to" minute
  const to = f.savedTo ? new Date(f.savedTo).getTime() + 59_999 : null;

  return tickets.filter(
    (t) =>
      (!q || matchesQuery(t, q)) &&
      (!flight || flightHaystack(t).includes(flight)) &&
      (!seat || fold(t.seat).includes(seat)) &&
      (!name || fold(t.name).includes(name)) &&
      (!f.flightDate || t.flightDate === f.flightDate) &&
      (from === null || t.savedAt >= from) &&
      (to === null || t.savedAt <= to) &&
      (!f.dupOnly || dups.has(t.id)),
  );
}
