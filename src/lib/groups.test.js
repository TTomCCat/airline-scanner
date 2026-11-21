import { describe, it, expect } from 'vitest';
import { groupByFlight, filterTickets, fold, EMPTY_FILTERS, hasFilters } from './groups.js';

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
