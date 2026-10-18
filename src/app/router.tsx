import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ImportPage } from '@/features/import/ImportPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { ItemsPage } from '@/features/items/ItemsPage';
import { PosPage } from '@/features/pos/PosPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { ReturnsPage } from '@/features/returns/ReturnsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AppShell } from './shell/AppShell';
import { RootLayout } from './shell/RootLayout';

const rootRoute = createRootRoute({ component: RootLayout });

// The POS is full-screen (PRD §5.3); every other page sits inside the app shell.
const posRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pos', component: PosPage });
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: AppShell,
});

const page = <P extends string>(path: P, component: () => React.ReactNode) =>
  createRoute({ getParentRoute: () => shellRoute, path, component });

const routeTree = rootRoute.addChildren([
  posRoute,
  shellRoute.addChildren([
    page('/', DashboardPage),
    page('/items', ItemsPage),
    page('/inventory', InventoryPage),
    page('/import', ImportPage),
    page('/returns', ReturnsPage),
    page('/reports', ReportsPage),
    page('/settings', SettingsPage),
  ]),
]);

/** Hash history works with the app:// protocol and needs no server-side routing. */
export const router = createRouter({ routeTree, history: createHashHistory() });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
