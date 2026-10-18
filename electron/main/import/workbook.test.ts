import { describe, expect, it } from 'vitest';
import { escapeCell, toCsv } from './workbook';

describe('export escaping', () => {
  it('neutralises formula-looking cells but keeps numbers', () => {
    expect(escapeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(escapeCell('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(escapeCell('-50')).toBe('-50');
    expect(escapeCell('Panadol')).toBe('Panadol');
    expect(escapeCell(12)).toBe(12);
  });

  it('writes CSV with a BOM and escaped cells', () => {
    const csv = toCsv([{ a: '=1+1', b: 'ok' }], ['a', 'b']);
    expect(csv.startsWith('﻿a,b')).toBe(true);
    expect(csv).toContain(`'=1+1`);
  });
});
