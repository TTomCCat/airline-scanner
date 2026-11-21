import { describe, it, expect } from 'vitest';
import { exportRows, exportFileName, formatSavedAt, sheetName, exportAllFileName } from './exportXlsx.js';

describe('export all', () => {
  it('makes safe, unique sheet names per flight', () => {
    const used = new Set();
    expect(sheetName({ flight: 'VN 0213', flightDate: '2026-11-22' }, used)).toBe('VN0213 22-11');
    expect(sheetName({ flight: 'VN 0213', flightDate: '2026-11-22' }, used)).toBe('VN0213 22-11_2');
    expect(sheetName({ flight: 'A/B:[1]', flightDate: '' }, used)).toBe('AB1');
  });

  it('names the file with today’s date', () => {
    expect(exportAllFileName(new Date(2026, 10, 21))).toBe('tat-ca-ve_2026-11-21.xlsx');
  });
});

describe('exportXlsx', () => {
  const at = (s) => new Date(s).getTime();

  it('formats saved time as dd/MM/yyyy HH:mm:ss', () => {
    expect(formatSavedAt(at('2026-11-21T08:05:09'))).toBe('21/11/2026 08:05:09');
  });

  it('builds a 3-column sheet, oldest first', () => {
    const rows = exportRows([
      { savedAt: at('2026-11-21T09:00:00'), raw: 'M1B', note: '' },
      { savedAt: at('2026-11-21T08:00:00'), raw: 'M1A', note: 'xe lăn' },
    ]);
    expect(rows).toEqual([
      ['Thời gian lưu', 'Mã gốc', 'Ghi chú'],
      ['21/11/2026 08:00:00', 'M1A', 'xe lăn'],
      ['21/11/2026 09:00:00', 'M1B', ''],
    ]);
  });

  it('names the file after flight and date', () => {
    expect(exportFileName({ flight: 'VN 213', flightDate: '2026-11-21' })).toBe('VN213_2026-11-21.xlsx');
  });
});

describe('language', () => {
  it('uses English headers and file name when switched to EN', async () => {
    const { setLang } = await import('./i18n.js');
    setLang('en');
    try {
      expect(exportRows([])[0]).toEqual(['Saved time', 'Raw code', 'Note']);
      expect(exportAllFileName(new Date(2026, 10, 21))).toBe('all-tickets_2026-11-21.xlsx');
    } finally {
      setLang('vi');
    }
  });
});
