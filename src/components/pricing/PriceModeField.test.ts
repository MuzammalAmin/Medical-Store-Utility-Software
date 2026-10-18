import { describe, expect, it } from 'vitest';
import { priceBreakdownText } from './PriceModeField';

describe('priceBreakdownText', () => {
  it('matches the PRD wording for Add GST', () => {
    expect(priceBreakdownText('add_gst', 10_000, 1800)).toBe(
      'Base Rs 100.00 + GST 18% (Rs 18.00) = Rs 118.00',
    );
  });

  it('matches the PRD wording for Sale price only', () => {
    expect(priceBreakdownText('price_only', 11_800, 1800)).toBe(
      'Rs 118.00 (includes GST 18% = Rs 18.00, base Rs 100.00)',
    );
  });
});
