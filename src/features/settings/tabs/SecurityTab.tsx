import { useMutation } from '@tanstack/react-query';
import { Eye, FileDown, Printer } from 'lucide-react';
import { useState } from 'react';
import type { Settings } from '@shared/settings';
import { Alert } from '@/components/ui/alert';
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
import { RecoveryKeyDisplay } from '@/features/setup/RecoveryKeyDisplay';
import { PinConfirmDialog } from '../PinConfirmDialog';
import { useSaveSettings } from '../useSaveSettings';

type KeyAction = 'view' | 'print' | 'save';

export function SecurityTab({ settings }: { settings: Settings }) {
  const save = useSaveSettings();
  const [minutes, setMinutes] = useState(String(settings.security.autoLockMinutes));
  const [action, setAction] = useState<KeyAction | null>(null);
  const [shownKey, setShownKey] = useState<string | null>(null);

  const recoveryKey = useMutation({
    mutationFn: ({ pin, action }: { pin: string; action: KeyAction }) =>
      ipc('security:recoveryKey', { pin, action }),
    onSuccess: (result) => {
      setShownKey(result.recoveryKey);
      setAction(null);
    },
  });

  const minutesValue = Number(minutes);
  const minutesValid = Number.isInteger(minutesValue) && minutesValue >= 1 && minutesValue <= 120;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Auto-lock</CardTitle>
          <CardDescription>
            Lock the screen after this many minutes without anyone using it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field
            label="Minutes"
            error={minutesValid ? undefined : 'Enter 1 to 120'}
            className="max-w-40"
          >
            <Input
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
        </CardContent>
        <CardFooter>
          <Button
            disabled={!minutesValid}
            loading={save.isPending}
            onClick={() =>
              save.mutate({ group: 'security', value: { autoLockMinutes: minutesValue } })
            }
          >
            Save
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recovery key</CardTitle>
          <CardDescription>
            Needed to open backups on a new or reinstalled computer. Make a new copy if the old one
            was lost.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setAction('view')}>
              <Eye /> Show
            </Button>
            <Button variant="secondary" onClick={() => setAction('print')}>
              <Printer /> Print
            </Button>
            <Button variant="secondary" onClick={() => setAction('save')}>
              <FileDown /> Save to file / USB
            </Button>
          </div>
          {shownKey && (
            <div className="flex flex-col gap-2">
              <RecoveryKeyDisplay value={shownKey} />
              <Button
                variant="ghost"
                size="sm"
                className="self-end"
                onClick={() => setShownKey(null)}
              >
                Hide
              </Button>
            </div>
          )}
          {recoveryKey.isSuccess && !shownKey && <Alert tone="success">Done.</Alert>}
        </CardContent>
      </Card>

      <PinConfirmDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAction(null);
            recoveryKey.reset();
          }
        }}
        title="Confirm it's you"
        description="The recovery key unlocks all pharmacy data. Enter your PIN to continue."
        confirmLabel="Continue"
        pending={recoveryKey.isPending}
        error={recoveryKey.error}
        onConfirm={(pin) => action && recoveryKey.mutate({ pin, action })}
      />
      {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
    </div>
  );
}
