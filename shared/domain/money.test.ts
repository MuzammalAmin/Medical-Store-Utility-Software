import { describe, expect, it } from 'vitest';
import { divRound, formatRupees, MoneyError, parseRupees } from './money';

describe('divRound', () => {
  it('rounds half away from zero', () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(4, 3)).toBe(1);
    expect(divRound(5, 3)).toBe(2);
  });

  it('rejects division by zero and non-integers', () => {
    expect(() => divRound(1, 0)).toThrow(MoneyError);
    expect(() => divRound(1.5, 2)).toThrow(MoneyError);
  });
});

describe('parseRupees', () => {
  it.each([
    ['1,234.50', 123450],
    ['Rs 99', 9900],
    ['rs. 12.5', 1250],
    ['0.05', 5],
    ['-20', -2000],
    [118, 11800],
    [12.499999999, 1250],
  ])('parses %s', (input, expected) => {
    expect(parseRupees(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '1.2.3', 'Rs', '--5'])('rejects %s', (input) => {
    expect(() => parseRupees(input)).toThrow(MoneyError);
  });

  it('rejects non-finite numbers', () => {
    expect(() => parseRupees(Number.NaN)).toThrow(MoneyError);
    expect(() => parseRupees(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });
});

describe('formatRupees', () => {
  it('formats with grouping and two decimals', () => {
    expect(formatRupees(123450)).toBe('Rs 1,234.50');
    expect(formatRupees(5)).toBe('Rs 0.05');
    expect(formatRupees(-2000)).toBe('−Rs 20.00');
  });
});
