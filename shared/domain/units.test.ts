import { describe, expect, it } from 'vitest';
import { availableUnits, derivedUnitPrice, toSmallestUnits, unitFactor } from './units';

const tenByTen = { tabsPerStrip: 10, stripsPerBox: 10 };
const syrup = { tabsPerStrip: 1, stripsPerBox: 1 };

describe('units', () => {
  it('computes unit factors', () => {
    expect(unitFactor('box', tenByTen)).toBe(100);
    expect(unitFactor('strip', tenByTen)).toBe(10);
    expect(unitFactor('tab', tenByTen)).toBe(1);
  });

  it('lists only units that make sense', () => {
    expect(availableUnits(tenByTen)).toEqual(['box', 'strip', 'tab']);
    expect(availableUnits(syrup)).toEqual(['box']);
    expect(availableUnits({ tabsPerStrip: 14, stripsPerBox: 1 })).toEqual(['box', 'tab']);
  });

  it('converts to smallest units', () => {
    expect(toSmallestUnits(2, 'strip', tenByTen)).toBe(20);
    expect(toSmallestUnits(1, 'box', tenByTen)).toBe(100);
  });

  it('derives strip and tablet prices from the box price (PRD example)', () => {
    expect(derivedUnitPrice(11_800, 'strip', tenByTen)).toBe(1_180);
    expect(derivedUnitPrice(11_800, 'tab', tenByTen)).toBe(118);
  });

  it('rounds derived prices to the nearest paisa', () => {
    // Rs 100 / 3 strips = Rs 33.333… → Rs 33.33
    expect(derivedUnitPrice(10_000, 'strip', { tabsPerStrip: 1, stripsPerBox: 3 })).toBe(3_333);
  });

  it('rejects invalid pack sizes', () => {
    expect(() => unitFactor('box', { tabsPerStrip: 0, stripsPerBox: 1 })).toThrow();
  });
});
