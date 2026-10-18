import { describe, expect, it } from 'vitest';
import { hasPermission, PERMISSIONS } from './permissions';

describe('permissions', () => {
  it('gives the owner every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission('owner', permission)).toBe(true);
    }
  });

  it('keeps cost, prices, import and admin away from staff', () => {
    expect(hasPermission('staff', 'pos.sell')).toBe(true);
    for (const permission of [
      'cost.view',
      'prices.edit',
      'import.run',
      'users.manage',
      'backup.manage',
      'sales.void',
    ] as const) {
      expect(hasPermission('staff', permission)).toBe(false);
    }
  });
});
