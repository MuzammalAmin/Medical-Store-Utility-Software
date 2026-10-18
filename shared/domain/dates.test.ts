import { describe, expect, it } from 'vitest';
import { addDays, formatExpiry, parseExpiry } from './dates';

describe('parseExpiry', () => {
  it.each([
    ['11/2027', '2027-11-30'],
    ['02/2028', '2028-02-29'],
    ['2/27', '2027-02-28'],
    ['15/09/2028', '2028-09-15'],
    ['2028-09-15', '2028-09-15'],
    [new Date(Date.UTC(2027, 4, 31)), '2027-05-31'],
  ])('parses %s', (input, expected) => {
    expect(parseExpiry(input)).toBe(expected);
  });

  it.each(['13/2027', '00/2027', '31/02/2027', 'abc', '', null, '2027'])('rejects %s', (input) => {
    expect(parseExpiry(input)).toBeNull();
  });

  it('formats and adds days', () => {
    expect(formatExpiry('2027-11-30')).toBe('11/2027');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});
