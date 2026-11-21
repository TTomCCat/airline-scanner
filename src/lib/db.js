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

/** Tickets with the same flight number on the same day belong to one group. */
export function flightKey(t) {
  return `${t.flight || ''}|${t.flightDate || ''}`;
}

/** Normalise older records (saved before `savedAt` / `note` existed). */
function normalise(t) {
  return {
    ...t,
    savedAt: t.savedAt ?? t.createdAt ?? t.updatedAt ?? 0,
    note: t.note ?? t.notes ?? '',
  };
}

/**
 * Save or update a ticket. Returns true if it already existed.
 * Re-scanning keeps the original saved time and only updates the data / note.
 */
export async function saveTicket(ticket) {
  const d = await db();
  const id = ticketId(ticket);
  const existing = await d.get('tickets', id);
  const now = Date.now();
  const savedAt = existing?.savedAt ?? existing?.createdAt ?? now;
  const keptEdits = Object.fromEntries((existing?.editedFields || []).map((k) => [k, existing[k]]));
  await d.put('tickets', {
    ...existing,
    ...ticket,
    ...keptEdits, // hand-corrected name / seat survive a re-scan
    id,
    note: ticket.note || existing?.note || existing?.notes || '', // an empty note never wipes an old one
    savedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  return Boolean(existing);
}

export async function listTickets() {
  return (await (await db()).getAll('tickets')).map(normalise);
}

/** Edit fields of a saved ticket (e.g. note, name, seat). The id and saved time stay the same. */
export async function updateTicket(id, patch) {
  const tx = (await db()).transaction('tickets', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) throw new Error('Ticket not found');
  // Remember which fields were corrected by hand so a re-scan of the same pass keeps them
  const edited = [...new Set([...(current.editedFields || []), ...Object.keys(patch).filter((k) => k !== 'note' && patch[k] !== current[k])])];
  await tx.store.put({
    ...current,
    ...patch,
    id,
    editedFields: edited,
    savedAt: current.savedAt ?? current.createdAt,
    updatedAt: Date.now(),
  });
  await tx.done;
}

export async function deleteTicket(id) {
  await (await db()).delete('tickets', id);
}

/** Delete several tickets in one transaction. */
export async function deleteTickets(ids) {
  const tx = (await db()).transaction('tickets', 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

/** Delete every ticket of one flight (flight number + date). */
export async function deleteFlight(key) {
  const all = await listTickets();
  await deleteTickets(all.filter((t) => flightKey(t) === key).map((t) => t.id));
}

export async function clearAll() {
  await (await db()).clear('tickets');
}
