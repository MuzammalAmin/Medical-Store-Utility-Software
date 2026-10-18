import { useQuery } from '@tanstack/react-query';
import { DatabaseBackup, KeyRound, Lock, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ipc } from '@/lib/ipc';
import { formatDateTime } from '@/lib/utils';
import { queryKeys } from '../queries';
import { useSessionUser } from '../session';
import { applyTheme, getStoredTheme, type Theme } from '../theme';
import { ChangePinDialog } from './ChangePinDialog';

const clock = new Intl.DateTimeFormat('en-PK', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function useClock(): string {
  const [now, setNow] = useState(() => clock.format(Date.now()));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(clock.format(Date.now())), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function TopBar({ onLock, locking }: { onLock: () => void; locking: boolean }) {
  const user = useSessionUser();
  const now = useClock();
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [pinOpen, setPinOpen] = useState(false);
  const { data: summary } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => ipc('dashboard:summary'),
    refetchInterval: 5 * 60_000,
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-surface px-6">
      <p className="text-sm text-muted-foreground">{now}</p>
      <div className="flex items-center gap-2">
        <span
          className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex"
          title="Last backup"
        >
          <DatabaseBackup className="size-4" aria-hidden />
          Last backup: {formatDateTime(summary?.lastBackupAt)}
        </span>
        <span className="mx-2 h-6 w-px bg-border" aria-hidden />
        <div className="text-right leading-tight">
          <p className="text-sm font-medium">{user.fullName}</p>
          <Badge tone={user.role === 'owner' ? 'primary' : 'neutral'} className="capitalize">
            {user.role}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPinOpen(true)}
          aria-label="Change my PIN"
          title="Change my PIN"
        >
          <KeyRound />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Switch light or dark theme"
          title="Theme"
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
        <Button variant="secondary" onClick={onLock} loading={locking} title="Lock (Ctrl+L)">
          <Lock /> Lock
        </Button>
      </div>
      <ChangePinDialog open={pinOpen} onOpenChange={setPinOpen} />
    </header>
  );
}
