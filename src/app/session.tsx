import { createContext, useContext, type ReactNode } from 'react';
import type { Permission } from '@shared/domain/permissions';
import type { SessionUser } from '@shared/ipc/contract';

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error('useSessionUser must be used inside SessionProvider');
  return user;
}

/** UI-only check for showing or hiding things; the main process enforces permissions. */
export function useCan(permission: Permission): boolean {
  return useSessionUser().permissions.includes(permission);
}
