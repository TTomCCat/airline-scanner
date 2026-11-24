import { describe, it, expect } from 'vitest';
import { currentFlight, duplicatesOf, ticketsFromParsed } from './tickets.js';

const tk = (id, flight, flightDate, seat, name, savedAt) => ({ id, flight, flightDate, seat, name, savedAt });

describe('ticketsFromParsed', () => {
  it('makes one ticket per leg with passenger fields and a trimmed note', () => {
    const parsed = {
      name: 'NGUYEN/VAN A',
      lastName: 'NGUYEN',
      firstName: 'VAN A',
      raw: 'M1...',
      legs: [
        { flight: 'VN 0213', seat: '12A' },
        { flight: 'VN 0244', seat: '3C' },
      ],
    };
    const out = ticketsFromParsed(parsed, '  wheelchair ');
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ name: 'NGUYEN/VAN A', raw: 'M1...', flight: 'VN 0244', seat: '3C', note: 'wheelchair' });
  });
});

describe('duplicatesOf', () => {
  it('finds saved tickets with the same seat on the same flight', () => {
    const saved = [tk('a', 'VN 0213', '2026-12-01', '12A', 'LE/VAN C', 1)];
    const scanned = [tk(undefined, 'VN 0213', '2026-12-01', '12A', 'TRAN/THI B')];
    expect(duplicatesOf(scanned, saved)).toHaveLength(1);
    expect(duplicatesOf([{ ...scanned[0], flightDate: '2026-12-02' }], saved)).toHaveLength(0);
  });
});

describe('currentFlight', () => {
  it('returns null when nothing is saved', () => {
    expect(currentFlight([])).toBeNull();
  });

  it('picks the flight of the latest save and counts its tickets', () => {
    const saved = [
      tk('a', 'VN 0213', '2026-12-01', '1A', 'A', 10),
      tk('b', 'VN 0213', '2026-12-01', '1B', 'B', 20),
      tk('c', 'VN 0213', '2026-12-02', '1C', 'C', 30),
      tk('d', 'VN 0213', '2026-12-01', '1D', 'D', 40),
    ];
    expect(currentFlight(saved)).toMatchObject({ flight: 'VN 0213', flightDate: '2026-12-01', count: 3 });
  });
});
