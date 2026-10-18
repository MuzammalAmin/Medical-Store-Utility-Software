import { Link, Outlet } from '@tanstack/react-router';
import { NAV_ITEMS, type NavItem } from '../navigation';
import { useAppState, useLogout } from '../queries';
import { useSessionUser } from '../session';
import { TopBar } from './TopBar';

export function AppShell() {
  const user = useSessionUser();
  const { data: state } = useAppState();
  const logout = useLogout();
  const items = NAV_ITEMS.filter((item) => user.permissions.includes(item.permission));

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-surface">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <div className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            AP
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">{state?.shopName}</p>
            <p className="text-xs text-muted-foreground">Pharmacy Manager</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
          {items.map((item) => (
            <NavLink key={item.to} {...item} />
          ))}
        </nav>
        <p className="px-5 py-3 text-xs text-muted-foreground">Version {state?.version}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onLock={() => logout.mutate()} locking={logout.isPending} />
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavLink({ to, label, icon: Icon, shortcut }: NavItem) {
  return (
    <Link
      to={to}
      className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
      activeProps={{ className: 'bg-primary-soft !text-primary' }}
      activeOptions={{ exact: to === '/' }}
    >
      <Icon className="size-4" aria-hidden />
      <span className="flex-1">{label}</span>
      {shortcut && <kbd className="text-xs text-muted-foreground">{shortcut}</kbd>}
    </Link>
  );
}
