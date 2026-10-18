import { Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAppState, useLogout } from '../queries';
import { useSessionUser } from '../session';
import { useIdleLock } from './useIdleLock';

/** Wraps every signed-in screen (including the full-screen POS) with auto-lock, Ctrl+L and F1. */
export function RootLayout() {
  const { data: state } = useAppState();
  const logout = useLogout();
  const navigate = useNavigate();
  const canSell = useSessionUser().permissions.includes('pos.sell');
  const lock = () => logout.mutate();

  useIdleLock(state?.autoLockMinutes ?? 10, lock);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        lock();
      } else if (event.key === 'F1' && canSell) {
        // F1 opens the POS from anywhere.
        event.preventDefault();
        void navigate({ to: '/pos' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return <Outlet />;
}
