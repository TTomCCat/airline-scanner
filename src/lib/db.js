// Ticket storage in the browser's IndexedDB (stays on this device).
import { openDB } from 'idb';

let dbPromise;
function db() {
  dbPromise ??= openDB('boarding-passes', 1, {
    upgrade(d) {
      d.createObjectStore('tickets', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

export function ticketId(t) {
  return [t.carrier, t.flightNo, t.flightDate, t.seat, t.lastName].join('|');
}

/** Save or update a ticket. Returns true if it already existed. */
export async function saveTicket(ticket) {
  const d = await db();
  const id = ticketId(ticket);
  const existing = await d.get('tickets', id);
  await d.put('tickets', {
    ...existing,
    ...ticket,
    id,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });
  return Boolean(existing);
}

/** All tickets: upcoming flights first (soonest first), then past ones (latest first). */
export async function listTickets() {
  const all = await (await db()).getAll('tickets');
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = all.filter((t) => t.flightDate >= today).sort((a, b) => a.flightDate.localeCompare(b.flightDate));
  const past = all.filter((t) => !(t.flightDate >= today)).sort((a, b) => (b.flightDate || '').localeCompare(a.flightDate || ''));
  return [...upcoming, ...past];
}

export async function deleteTicket(id) {
  await (await db()).delete('tickets', id);
}
