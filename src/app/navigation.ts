import {
  BarChart3,
  LayoutDashboard,
  Package,
  Pill,
  Settings,
  ShoppingCart,
  Undo2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@shared/domain/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  shortcut?: string;
}

/** Sidebar order follows PRD §5.3. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'items.view' },
  { to: '/pos', label: 'POS', icon: ShoppingCart, permission: 'pos.sell', shortcut: 'F1' },
  { to: '/items', label: 'Items', icon: Pill, permission: 'items.view' },
  { to: '/inventory', label: 'Inventory', icon: Package, permission: 'stock.view' },
  { to: '/import', label: 'Import', icon: Upload, permission: 'import.run' },
  { to: '/returns', label: 'Returns', icon: Undo2, permission: 'returns.create' },
  { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports.view' },
  { to: '/settings', label: 'Settings', icon: Settings, permission: 'settings.manage' },
];
