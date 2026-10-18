import { describe, expect, it } from 'vitest';
import { computePrice, formatPercent, parsePercent } from './gst';
import { MoneyError } from './money';

describe('computePrice', () => {
  it('adds GST on top in add_gst mode (PRD example)', () => {
    expect(computePrice('add_gst', 10_000, 1800)).toEqual({
      basePaisa: 10_000,
      gstPaisa: 1_800,
      finalPaisa: 11_800,
    });
  });

  it('works GST out of the price in price_only mode (PRD example)', () => {
    expect(computePrice('price_only', 11_800, 1800)).toEqual({
      basePaisa: 10_000,
      gstPaisa: 1_800,
      finalPaisa: 11_800,
    });
  });

  it('never changes the entered total in price_only mode', () => {
    for (const amount of [1, 99, 101, 12_345, 99_999]) {
      const result = computePrice('price_only', amount, 1800);
      expect(result.finalPaisa).toBe(amount);
      expect(result.basePaisa + result.gstPaisa).toBe(amount);
    }
  });

  it('treats a 0% rate as GST-exempt in both modes', () => {
    expect(computePrice('add_gst', 5_000, 0).gstPaisa).toBe(0);
    expect(computePrice('price_only', 5_000, 0).gstPaisa).toBe(0);
  });

  it('supports custom rates', () => {
    expect(computePrice('add_gst', 10_000, 500).finalPaisa).toBe(10_500);
    expect(computePrice('add_gst', 10_000, 1750).gstPaisa).toBe(1_750);
  });

  it('rejects invalid input', () => {
    expect(() => computePrice('add_gst', -1, 1800)).toThrow(MoneyError);
    expect(() => computePrice('add_gst', 100, 10_001)).toThrow(MoneyError);
    expect(() => computePrice('add_gst', 1.5, 1800)).toThrow(MoneyError);
  });
});

describe('parsePercent / formatPercent', () => {
  it.each([
    ['18', 1800],
    ['18%', 1800],
    [' 17.5 % ', 1750],
    ['0', 0],
    [5, 500],
  ])('parses %s', (input, expected) => {
    expect(parsePercent(input)).toBe(expected);
  });

  it.each(['-1', 'abc', '101', '18.555'])('rejects %s', (input) => {
    expect(() => parsePercent(input)).toThrow(MoneyError);
  });

  it('formats rates', () => {
    expect(formatPercent(1800)).toBe('18%');
    expect(formatPercent(1750)).toBe('17.5%');
    expect(formatPercent(1725)).toBe('17.25%');
  });
});
