import { describe, it, expect } from 'vitest';
import { groupByFlight, filterTickets, findDuplicates, matchesFor, fold, EMPTY_FILTERS, hasFilters } from './groups.js';

const at = (s) => new Date(s).getTime();
const t = (o) => ({ flight: 'VN 213', flightDate: '2026-11-21', seat: '12A', name: 'NGUYEN VAN A', savedAt: 0, ...o });

const tickets = [
  t({ id: 1, seat: '12A', savedAt: at('2026-11-21T08:00') }),
  t({ id: 2, seat: '12B', name: 'TRAN THI B', savedAt: at('2026-11-21T09:30') }),
  t({ id: 3, flight: 'VN 213', flightDate: '2026-11-22', seat: '3C', savedAt: at('2026-11-21T10:00') }),
  t({ id: 4, flight: 'VJ 120', flightDate: '2026-11-20', seat: '30F', name: 'LE VAN C', savedAt: at('2026-11-20T07:00') }),
];

describe('groupByFlight', () => {
  const groups = groupByFlight(tickets, '2026-11-21');

  it('groups by flight number + date', () => {
    expect(groups.map((g) => g.key)).toEqual(['VN 213|2026-11-21', 'VN 213|2026-11-22', 'VJ 120|2026-11-20']);
  });

  it('sorts tickets in a group newest saved first', () => {
    expect(groups[0].tickets.map((x) => x.id)).toEqual([2, 1]);
  });

  it('puts past flights after upcoming ones', () => {
    expect(groups.at(-1).flight).toBe('VJ 120');
  });
});

describe('filterTickets', () => {
  const ids = (f) => filterTickets(tickets, { ...EMPTY_FILTERS, ...f }).map((x) => x.id);

  it('returns everything with no filters', () => {
    expect(ids({})).toEqual([1, 2, 3, 4]);
  });

  it('matches flight ignoring case and spaces', () => {
    expect(ids({ flight: 'vj120' })).toEqual([4]);
  });

  it('ignores leading zeros in the flight number', () => {
    const z = [t({ id: 9, flight: 'VN 0213' })];
    for (const q of ['vn213', 'VN 0213', '0213', '213']) {
      expect(filterTickets(z, { ...EMPTY_FILTERS, flight: q }).map((x) => x.id)).toEqual([9]);
    }
  });

  it('matches seat substring', () => {
    expect(ids({ seat: '12' })).toEqual([1, 2]);
  });

  it('matches exact flight date', () => {
    expect(ids({ flightDate: '2026-11-22' })).toEqual([3]);
  });

  it('matches name ignoring accents and case', () => {
    expect(ids({ name: 'trần thị' })).toEqual([2]);
  });

  it('filters by saved time range (inclusive minutes)', () => {
    expect(ids({ savedFrom: '2026-11-21T08:00', savedTo: '2026-11-21T09:30' })).toEqual([1, 2]);
    expect(ids({ savedTo: '2026-11-20T23:59' })).toEqual([4]);
  });

  it('quick search matches name, seat or flight', () => {
    const slash = [t({ id: 7, name: 'NGUYEN/VAN A', pnr: 'ABC123' })];
    expect(filterTickets(slash, { ...EMPTY_FILTERS, q: 'nguyen van' }).map((x) => x.id)).toEqual([7]);
    expect(filterTickets(slash, { ...EMPTY_FILTERS, q: 'abc123' }).map((x) => x.id)).toEqual([7]);
    expect(ids({ q: '30f' })).toEqual([4]);
    expect(ids({ q: 'Trần' })).toEqual([2]);
    expect(ids({ q: 'vj120' })).toEqual([4]);
  });

  it('combines filters', () => {
    expect(ids({ flight: 'VN 213', seat: 'B' })).toEqual([2]);
  });
});

describe('helpers', () => {
  it('fold strips accents and đ', () => {
    expect(fold('Đặng Văn  Hùng')).toBe('dangvanhung');
  });

  it('hasFilters', () => {
    expect(hasFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasFilters({ ...EMPTY_FILTERS, seat: '1' })).toBe(true);
  });
});

describe('findDuplicates', () => {
  const list = [
    t({ id: 'a', seat: '12A', name: 'NGUYEN VAN A' }),
    t({ id: 'b', seat: '12A', name: 'TRAN THI B' }), // same seat as a
    t({ id: 'c', seat: '14C', name: 'Nguyễn Văn A' }), // same name as a (accents / case)
    t({ id: 'd', seat: '20D', name: 'LE VAN D' }), // unique
    t({ id: 'e', flightDate: '2026-11-22', seat: '12A', name: 'NGUYEN VAN A' }), // other day: not a duplicate
    t({ id: 'f', seat: '', name: 'PHAM E' }),
    t({ id: 'g', seat: '', name: 'HO F' }), // empty seats never match
  ];
  const d = findDuplicates(list);

  it('flags same seat and same name on the same flight', () => {
    expect(d.get('a')).toEqual({ seat: true, name: true });
    expect(d.get('b')).toEqual({ seat: true, name: false });
    expect(d.get('c')).toEqual({ seat: false, name: true });
  });

  it('ignores unique tickets, other flights and empty seats', () => {
    expect([...d.keys()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('flags an identical pass scanned twice', () => {
    const twice = findDuplicates([t({ id: 1 }), t({ id: 2 })]);
    expect(twice.get(1)).toEqual({ seat: true, name: true });
    expect(twice.get(2)).toEqual({ seat: true, name: true });
  });

  it('dupOnly filter keeps only duplicates', () => {
    expect(filterTickets(list, { ...EMPTY_FILTERS, dupOnly: true }).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('matchesFor', () => {
  const saved = [
    t({ id: 1, seat: '12A', name: 'TRAN THI B' }),
    t({ id: 2, seat: '3C', name: 'nguyen van a' }),
    t({ id: 3, flight: 'VJ 120', seat: '12A', name: 'NGUYEN VAN A' }),
  ];

  it('finds saved tickets with the same seat or name on the same flight', () => {
    const m = matchesFor(t({ seat: '12a', name: 'NGUYEN VAN A' }), saved);
    expect(m.map((x) => [x.ticket.id, x.seat, x.name])).toEqual([
      [1, true, false],
      [2, false, true],
    ]);
  });

  it('returns nothing for a new seat and name', () => {
    expect(matchesFor(t({ seat: '30F', name: 'LE VAN C' }), saved)).toEqual([]);
  });
});
