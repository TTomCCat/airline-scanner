// Parser for IATA BCBP (Bar Coded Boarding Pass) strings — the text inside
// the PDF417 barcode printed on airline boarding passes.

import { cityName } from './airports.js';

export class BcbpError extends Error {}

const CABINS = {
  F: 'First', A: 'First', P: 'First',
  J: 'Business', C: 'Business', D: 'Business', I: 'Business', Z: 'Business', R: 'Business',
  W: 'Premium Economy', E: 'Premium Economy',
  Y: 'Economy', B: 'Economy', H: 'Economy', K: 'Economy', L: 'Economy', M: 'Economy',
  N: 'Economy', Q: 'Economy', S: 'Economy', T: 'Economy', V: 'Economy', X: 'Economy',
  G: 'Economy', O: 'Economy', U: 'Economy',
};

const TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'MSTR', 'DR', 'PROF', 'CHD', 'INF']);

// Conditional "unique" section (appears once, in leg 1 only)
const UNIQUE_FIELDS = [
  ['passengerDescription', 1],
  ['checkInSource', 1],
  ['boardingPassSource', 1],
  ['issueDate', 4], // last digit of year + Julian day
  ['documentType', 1],
  ['issuingAirline', 3],
  ['bagTag1', 13],
  ['bagTag2', 13],
  ['bagTag3', 13],
];

// Conditional "repeated" section (one per leg)
const REPEATED_FIELDS = [
  ['airlineNumericCode', 3],
  ['documentSerial', 10],
  ['selectee', 1],
  ['documentVerification', 1],
  ['marketingCarrier', 3],
  ['frequentFlyerAirline', 3],
  ['frequentFlyerNumber', 16],
  ['idAdIndicator', 1],
  ['freeBaggage', 3],
  ['fastTrack', 1],
];

const LEG_MANDATORY_LEN = 37; // PNR .. variable-size field

function hex(str) {
  const n = parseInt(str, 16);
  return Number.isFinite(n) ? n : 0;
}

/** Read fixed-width fields in order, stopping when the string runs out. */
function readFields(str, spec) {
  const out = {};
  let p = 0;
  for (const [key, len] of spec) {
    if (p + len > str.length) break;
    const v = str.slice(p, p + len).trim();
    if (v) out[key] = v;
    p += len;
  }
  return out;
}

function splitName(full) {
  const [last = '', rest = ''] = full.split('/');
  const words = rest.trim().split(/\s+/).filter(Boolean);
  let title = '';
  if (words.length > 1 && TITLES.has(words[words.length - 1])) title = words.pop();
  return { lastName: last.trim(), firstName: words.join(' '), title };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function dayOfYearToDate(year, day) {
  const d = new Date(Date.UTC(year, 0, 1));
  d.setUTCDate(day);
  return d;
}

/**
 * Convert a Julian day-of-year (1–366) to an ISO date. BCBP has no year,
 * so pick the year (last / this / next) that puts the date closest to today.
 */
export function julianToDate(julian, today = new Date()) {
  const day = parseInt(julian, 10);
  if (!Number.isFinite(day) || day < 1 || day > 366) return '';
  const y = today.getFullYear();
  const todayUtc = Date.UTC(y, today.getMonth(), today.getDate());
  let best = null;
  for (const year of [y - 1, y, y + 1]) {
    const d = dayOfYearToDate(year, day);
    if (d.getUTCFullYear() !== year) continue; // day 366 in a non-leap year
    const diff = Math.abs(d.getTime() - todayUtc);
    if (!best || diff < best.diff) best = { d, diff };
  }
  if (!best) return '';
  const { d } = best;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function parseLeg(m, today) {
  const carrier = m.slice(13, 16).trim();
  const flightNo = m.slice(16, 21).trim();
  const from = m.slice(7, 10).trim();
  const to = m.slice(10, 13).trim();
  const cabin = m.slice(24, 25).trim();
  const julian = m.slice(21, 24).trim();
  const seatRaw = m.slice(25, 29).trim();
  return {
    pnr: m.slice(0, 7).trim(),
    from,
    fromCity: cityName(from),
    to,
    toCity: cityName(to),
    carrier,
    flightNo,
    flight: `${carrier} ${flightNo}`.trim(),
    julianDate: julian,
    flightDate: julianToDate(julian, today),
    cabin,
    cabinName: CABINS[cabin] || '',
    seat: seatRaw.replace(/^0+(?=\d)/, ''),
    sequence: m.slice(29, 34).trim(),
    passengerStatus: m.slice(34, 35).trim(),
  };
}

/**
 * Parse a BCBP string into readable fields.
 * @param {string} input  raw barcode text
 * @param {Date} [today]  reference date used to guess the flight year
 */
export function parseBCBP(input, today = new Date()) {
  if (typeof input !== 'string') throw new BcbpError('No barcode text');
  const raw = input.replace(/^\s+/, '').replace(/[\r\n]+$/, '');

  if (raw[0] !== 'M' || raw.length < 60) {
    throw new BcbpError('Not a boarding pass barcode (expected IATA BCBP format)');
  }
  const legCount = parseInt(raw[1], 10);
  if (!(legCount >= 1 && legCount <= 4)) {
    throw new BcbpError('Not a boarding pass barcode (invalid number of legs)');
  }

  const name = raw.slice(2, 22).trim();
  const result = {
    raw,
    format: raw[0],
    legCount,
    name,
    ...splitName(name),
    eTicket: raw[22] === 'E',
    version: '',
    legs: [],
    warnings: [],
  };

  let pos = 23;
  for (let i = 0; i < legCount; i++) {
    if (raw.length < pos + LEG_MANDATORY_LEN) {
      result.warnings.push(`Leg ${i + 1} is incomplete`);
      break;
    }
    const m = raw.slice(pos, pos + LEG_MANDATORY_LEN);
    const leg = parseLeg(m, today);
    const varSize = hex(m.slice(35, 37));
    const varField = raw.slice(pos + LEG_MANDATORY_LEN, pos + LEG_MANDATORY_LEN + varSize);
    pos += LEG_MANDATORY_LEN + varSize;

    // Optional data — best effort, never fail the whole parse because of it
    try {
      let rest = varField;
      if (i === 0 && varField[0] === '>') {
        result.version = varField[1] || '';
        const uniqueSize = hex(varField.slice(2, 4));
        Object.assign(result, readFields(varField.slice(4, 4 + uniqueSize), UNIQUE_FIELDS));
        rest = varField.slice(4 + uniqueSize);
      }
      if (rest.length >= 2) {
        const repSize = hex(rest.slice(0, 2));
        Object.assign(leg, readFields(rest.slice(2, 2 + repSize), REPEATED_FIELDS));
        const airlineUse = rest.slice(2 + repSize).trim();
        if (airlineUse) leg.airlineData = airlineUse;
      }
      if (leg.airlineNumericCode && leg.documentSerial) {
        leg.ticketNumber = leg.airlineNumericCode + leg.documentSerial;
      }
    } catch {
      result.warnings.push(`Could not read optional data for leg ${i + 1}`);
    }

    result.legs.push(leg);
  }

  if (pos < raw.length) {
    const tail = raw.slice(pos);
    if (tail[0] === '^') result.securityData = tail;
  }

  return result;
}
