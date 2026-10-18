import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, FolderOpen, RotateCcw, Usb } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { BackupInfo } from '@shared/ipc/contract';
import type { Settings } from '@shared/settings';
import { queryKeys } from '@/app/queries';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage, ipc } from '@/lib/ipc';
import { formatBytes, formatDateTime } from '@/lib/utils';
import { PinConfirmDialog } from '../PinConfirmDialog';
import { useSaveSettings } from '../useSaveSettings';

const REASON_LABELS: Record<string, string> = {
  manual: 'Manual',
  daily: 'Daily',
  close: 'On close',
  setup: 'After setup',
  'pre-import': 'Before import',
  'pre-restore': 'Before restore',
};

export function BackupTab({ settings }: { settings: Settings }) {
  const client = useQueryClient();
  const saveSettings = useSaveSettings();
  const [dailyTime, setDailyTime] = useState(settings.backup.dailyTime);
  const [keepCount, setKeepCount] = useState(String(settings.backup.keepCount));
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);

  const status = useQuery({
    queryKey: queryKeys.backupStatus,
    queryFn: () => ipc('backup:status'),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: queryKeys.backupStatus });
    void client.invalidateQueries({ queryKey: queryKeys.dashboard });
  };

  const backupNow = useMutation({
    mutationFn: () => ipc('backup:create'),
    onSuccess: (next) => {
      client.setQueryData(queryKeys.backupStatus, next);
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
      toast.success(next.usbAvailable ? 'Backup created and copied to USB' : 'Backup created');
    },
  });
  const chooseUsb = useMutation({
    mutationFn: () => ipc('backup:chooseUsbFolder'),
    onSuccess: (next) => {
      client.setQueryData(queryKeys.settings, next);
      refresh();
    },
  });
  const restore = useMutation({
    mutationFn: ({ fileName, pin }: { fileName: string; pin: string }) =>
      ipc('backup:restore', { fileName, ownerPin: pin }),
    onSuccess: () => {
      toast.success('Backup restored. Please log in again');
      void client.invalidateQueries({ queryKey: queryKeys.appState });
    },
  });

  const keepValue = Number(keepCount);
  const scheduleValid =
    /^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime) &&
    Number.isInteger(keepValue) &&
    keepValue >= 5 &&
    keepValue <= 365;
  const data = status.data;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Backup now</CardTitle>
          <CardDescription>
            Backups are encrypted and checked automatically. One is also made every day and whenever
            the app closes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            Last backup: <span className="font-medium">{formatDateTime(data?.lastBackupAt)}</span>
          </p>
          <p className="text-muted-foreground">
            Folder: <span className="font-mono text-xs">{data?.folder}</span>
          </p>
          {backupNow.error && <Alert tone="danger">{errorMessage(backupNow.error)}</Alert>}
        </CardContent>
        <CardFooter>
          <Button onClick={() => backupNow.mutate()} loading={backupNow.isPending}>
            <DatabaseBackup /> Back up now
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Usb className="size-4" aria-hidden /> USB copy
          </CardTitle>
          <CardDescription>
            Every backup is also copied to this folder when the USB drive is plugged in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs">{settings.backup.usbFolder || 'Not set'}</span>
            {settings.backup.usbFolder && (
              <Badge tone={data?.usbAvailable ? 'success' : 'warning'}>
                {data?.usbAvailable ? 'Connected' : 'Not connected'}
              </Badge>
            )}
          </div>
          {data?.usbAvailable && <p>Last copy on USB: {formatDateTime(data.lastUsbCopyAt)}</p>}
          {chooseUsb.error && <Alert tone="danger">{errorMessage(chooseUsb.error)}</Alert>}
        </CardContent>
        <CardFooter>
          <Button
            variant="secondary"
            onClick={() => chooseUsb.mutate()}
            loading={chooseUsb.isPending}
          >
            <FolderOpen /> Choose USB folder
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Daily backup time" hint="24-hour, e.g. 21:00">
            <Input type="time" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} />
          </Field>
          <Field label="Backups to keep" hint="5 to 365. Older ones are deleted.">
            <Input
              inputMode="numeric"
              value={keepCount}
              onChange={(e) => setKeepCount(e.target.value)}
            />
          </Field>
        </CardContent>
        <CardFooter>
          <Button
            disabled={!scheduleValid}
            loading={saveSettings.isPending}
            onClick={() =>
              saveSettings.mutate({
                group: 'backup',
                value: { ...settings.backup, dailyTime, keepCount: keepValue },
              })
            }
          >
            Save
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved backups</CardTitle>
          <CardDescription>
            Restoring replaces all current data. A backup of the current data is made first.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data && data.backups.length === 0 ? (
            <p className="px-6 py-5 text-sm text-muted-foreground">No backups yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-surface-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-6 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 text-right font-medium">Size</th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody>
                {data?.backups.map((b) => (
                  <tr key={b.fileName} className="border-b last:border-0">
                    <td className="px-6 py-2 tabular-nums">{formatDateTime(b.createdAt)}</td>
                    <td className="px-3 py-2">{REASON_LABELS[b.reason] ?? b.reason}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatBytes(b.sizeBytes)}
                    </td>
                    <td className="px-6 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setRestoreTarget(b)}>
                        <RotateCcw /> Restore
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <PinConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRestoreTarget(null);
            restore.reset();
          }
        }}
        title="Restore this backup?"
        description={`All current data will be replaced with the backup from ${formatDateTime(restoreTarget?.createdAt)}. Everyone will be logged out.`}
        confirmLabel="Restore"
        danger
        pending={restore.isPending}
        error={restore.error}
        onConfirm={(pin) =>
          restoreTarget && restore.mutate({ fileName: restoreTarget.fileName, pin })
        }
      />
    </div>
  );
}
