import { describe, it, expect, afterEach } from 'vitest';
import { t, setLang, getLang } from './i18n.js';
import { STRINGS } from './strings.js';

afterEach(() => setLang('vi'));

describe('i18n', () => {
  it('defaults to Vietnamese and switches to English', () => {
    expect(getLang()).toBe('vi');
    expect(t('save')).toBe('Lưu');
    setLang('en');
    expect(t('save')).toBe('Save');
  });

  it('fills placeholders', () => {
    setLang('en');
    expect(t('deletedFlight', { n: 3, flight: 'VN 213' })).toBe('Flight VN 213 deleted (3 tickets)');
  });

  it('uses English singulars for n = 1', () => {
    setLang('en');
    expect(t('nTickets', { n: 1 })).toBe('1 ticket');
    expect(t('nTickets', { n: 2 })).toBe('2 tickets');
    setLang('vi');
    expect(t('nTickets', { n: 1 })).toBe('1 vé');
  });

  it('ignores unknown languages', () => {
    setLang('fr');
    expect(getLang()).toBe('vi');
  });

  it('has every Vietnamese key in English and vice versa', () => {
    const base = (k) => k.replace(/_one$/, '');
    const vi = Object.keys(STRINGS.vi);
    const en = Object.keys(STRINGS.en).map(base);
    expect(vi.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !vi.includes(k))).toEqual([]);
  });
});
