export { formatRupees } from '@shared/domain/money';
export { formatPercent } from '@shared/domain/gst';
export { formatExpiry } from '@shared/domain/dates';
export { describeQty } from '@shared/domain/items';

/** Invoice and return numbers are always shown with six digits: #000245. */
export const docNo = (n: number) => `#${String(n).padStart(6, '0')}`;
