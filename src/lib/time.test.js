import { describe, it, expect } from 'vitest';
import { relTime, shortTime } from './time.js';

const now = new Date('2026-11-24T15:00:00').getTime();

describe('relTime', () => {
  it('says "now" for the last few seconds', () => {
    expect(relTime(now - 10_000, now, 'en-GB')).toBe('now');
  });

  it('uses minutes, then hours', () => {
    expect(relTime(now - 5 * 60_000, now, 'en-GB')).toBe('5 min ago');
    expect(relTime(now - 3 * 3_600_000, now, 'en-GB')).toBe('3 hr ago');
  });

  it('falls back to clock + date after 12 hours', () => {
    const old = new Date('2026-11-21T08:05:00').getTime();
    expect(relTime(old, now, 'en-GB')).toBe(shortTime(old));
    expect(shortTime(old)).toBe('08:05 21/11');
  });
});
