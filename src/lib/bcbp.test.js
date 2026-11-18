import { describe, it, expect } from 'vitest';
import { parseBCBP, julianToDate, BcbpError } from './bcbp.js';

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');

// Fictional sample in the shape of an MH0759 SGN→KUL boarding pass
const unique = '0' + 'O' + 'O' + '6322' + 'B' + 'MH '; // 11 chars
const repeated =
  '232' + '1234567890' + '0' + ' ' + 'MH ' + 'MH ' + '123456789'.padEnd(16) + ' ' + '30K' + 'N';
const airlineUse = '*30600000K09';
const varField = '>' + '6' + hex2(unique.length) + unique + hex2(repeated.length) + repeated + airlineUse;
const SAMPLE =
  'M1' +
  'DOE/JOHN PAUL MR'.padEnd(20) +
  'E' +
  'ABC123'.padEnd(7) +
  'SGN' +
  'KUL' +
  'MH ' +
  '0759 ' +
  '322' +
  'Y' +
  '026D' +
  '0010 ' +
  '1' +
  hex2(varField.length) +
  varField;

const TODAY = new Date(2026, 10, 18); // 18 Nov 2026

describe('parseBCBP', () => {
  it('reads the mandatory fields', () => {
    const r = parseBCBP(SAMPLE, TODAY);
    expect(r.name).toBe('DOE/JOHN PAUL MR');
    expect(r.lastName).toBe('DOE');
    expect(r.firstName).toBe('JOHN PAUL');
    expect(r.title).toBe('MR');
    expect(r.eTicket).toBe(true);
    expect(r.legs).toHaveLength(1);
    const leg = r.legs[0];
    expect(leg).toMatchObject({
      pnr: 'ABC123',
      from: 'SGN',
      fromCity: 'Ho Chi Minh City',
      to: 'KUL',
      toCity: 'Kuala Lumpur',
      carrier: 'MH',
      flightNo: '0759',
      flight: 'MH 0759',
      flightDate: '2026-11-18',
      cabin: 'Y',
      cabinName: 'Economy',
      seat: '26D',
      sequence: '0010',
      passengerStatus: '1',
    });
  });

  it('reads the optional conditional data', () => {
    const r = parseBCBP(SAMPLE, TODAY);
    expect(r.version).toBe('6');
    expect(r.issueDate).toBe('6322');
    expect(r.issuingAirline).toBe('MH');
    const leg = r.legs[0];
    expect(leg.ticketNumber).toBe('2321234567890');
    expect(leg.frequentFlyerAirline).toBe('MH');
    expect(leg.frequentFlyerNumber).toBe('123456789');
    expect(leg.freeBaggage).toBe('30K');
    expect(leg.airlineData).toBe('*30600000K09');
    expect(r.warnings).toEqual([]);
  });

  it('works with only the 60 mandatory characters', () => {
    const minimal = SAMPLE.slice(0, 58) + '00';
    const r = parseBCBP(minimal, TODAY);
    expect(r.legs[0].seat).toBe('26D');
    expect(r.legs[0].ticketNumber).toBeUndefined();
  });

  it('parses two legs', () => {
    const leg2 = 'ABC123 KULSINMH 0603 323Y012A0011 100';
    const two = 'M2' + SAMPLE.slice(2) + leg2;
    const r = parseBCBP(two, TODAY);
    expect(r.legs).toHaveLength(2);
    expect(r.legs[1]).toMatchObject({ from: 'KUL', to: 'SIN', flightNo: '0603', seat: '12A', flightDate: '2026-11-19' });
  });

  it('rejects text that is not a boarding pass', () => {
    expect(() => parseBCBP('https://example.com')).toThrow(BcbpError);
    expect(() => parseBCBP('M1SHORT')).toThrow(BcbpError);
    expect(() => parseBCBP('X' + SAMPLE.slice(1))).toThrow(BcbpError);
  });
});

describe('julianToDate', () => {
  it('converts day of year', () => {
    expect(julianToDate('322', TODAY)).toBe('2026-11-18');
    expect(julianToDate('001', TODAY)).toBe('2027-01-01'); // nearer next year
  });

  it('handles year rollover around new year', () => {
    expect(julianToDate('360', new Date(2027, 0, 3))).toBe('2026-12-26');
    expect(julianToDate('005', new Date(2026, 11, 30))).toBe('2027-01-05');
  });

  it('returns empty for invalid input', () => {
    expect(julianToDate('   ', TODAY)).toBe('');
    expect(julianToDate('999', TODAY)).toBe('');
  });
});
