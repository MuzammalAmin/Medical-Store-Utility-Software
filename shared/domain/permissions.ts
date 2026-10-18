/**
 * Role-based access (PRD §2). The main process checks these on every IPC call;
 * the UI uses the same table only to decide what to show.
 */
export const ROLES = ['owner', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'pos.sell',
  'items.view',
  'items.edit',
  'prices.edit',
  'stock.view',
  'stock.adjust',
  'cost.view',
  'returns.create',
  'returns.approve',
  'sales.void',
  'import.run',
  'reports.view',
  'settings.manage',
  'users.manage',
  'backup.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const STAFF_PERMISSIONS: readonly Permission[] = [
  'pos.sell',
  'items.view',
  'stock.view',
  'returns.create',
];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  staff: new Set(STAFF_PERMISSIONS),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
