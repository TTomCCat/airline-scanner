import { describe, it, expect } from 'vitest';
import { planUpload, quoteTab, ticketRow, headerRow } from './googleSheets.js';

const tk = (id, extra = {}) => ({ id, flight: 'VN 213', flightDate: '2026-11-22', name: 'NGUYEN/AN', seat: '12A', raw: 'M1X', note: '', savedAt: 1, ...extra });
const group = (tickets, flight = 'VN 213') => ({ flight, flightDate: '2026-11-22', tickets });

describe('planUpload', () => {
  it('writes a header and appends rows to an empty tab', () => {
    const { data, added, updated } = planUpload([group([tk('a', { savedAt: 2 }), tk('b', { savedAt: 1 })])]);
    expect(added).toBe(2);
    expect(updated).toBe(0);
    expect(data.map((d) => d.range)).toEqual(["'VN213 22-11'!A1:J1", "'VN213 22-11'!A2:J2", "'VN213 22-11'!A3:J3"]);
    expect(data[0].values[0]).toEqual(headerRow());
    expect(data[1].values[0][9]).toBe('b'); // oldest first
  });

  it('updates rows already in the sheet and appends new ones after the last row', () => {
    const existing = new Map([['VN213 22-11', [headerRow(), ['', '', '', '', '', '', '', '', '', 'a'], [], ['', '', '', '', '', '', '', '', '', 'c']]]]);
    const { data, added, updated } = planUpload([group([tk('a', { note: 'late' }), tk('b')])], existing);
    expect(updated).toBe(1);
    expect(added).toBe(1);
    expect(data.map((d) => d.range)).toEqual(["'VN213 22-11'!A2:J2", "'VN213 22-11'!A5:J5"]);
    expect(data[0].values[0][8]).toBe('late');
  });

  it('keeps flights in separate tabs', () => {
    const { data } = planUpload([group([tk('a')]), group([tk('b', { flight: 'VJ 1' })], 'VJ 1')]);
    expect(data.map((d) => d.range)).toContain("'VJ1 22-11'!A2:J2");
  });
});

describe('helpers', () => {
  it('quotes tab names for A1 ranges', () => {
    expect(quoteTab("O'Hare")).toBe("'O''Hare'");
  });

  it('builds a row with the id last', () => {
    const row = ticketRow(tk('x', { from: 'SGN', to: 'HAN' }));
    expect(row).toHaveLength(10);
    expect(row[3]).toBe('SGN');
    expect(row[9]).toBe('x');
  });
});
