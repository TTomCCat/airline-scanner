// Turning a parsed boarding pass into ticket records, and finding the flight being scanned now.
import { flightKey } from './db.js';
import { matchesFor } from './groups.js';

/** One ticket per flight leg of a parsed pass. */
export function ticketsFromParsed(parsed, note = '') {
  const passenger = { name: parsed.name, lastName: parsed.lastName, firstName: parsed.firstName, raw: parsed.raw };
  return parsed.legs.map((leg) => ({ ...passenger, ...leg, note: note.trim() }));
}

/** Saved tickets that share a seat or name with any of `tickets` on the same flight. */
export function duplicatesOf(tickets, saved) {
  return tickets.flatMap((tk) => matchesFor(tk, saved));
}

/**
 * The flight of the most recently saved ticket, with how many tickets it has.
 * Returns null when nothing is saved.
 */
export function currentFlight(saved) {
  if (!saved?.length) return null;
  const last = saved.reduce((a, b) => ((b.savedAt || 0) > (a.savedAt || 0) ? b : a));
  const key = flightKey(last);
  const count = saved.filter((tk) => flightKey(tk) === key).length;
  return { key, flight: last.flight, flightDate: last.flightDate, from: last.from, to: last.to, count };
}
