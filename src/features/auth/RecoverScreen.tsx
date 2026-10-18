import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useSetAppState } from '@/app/queries';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { errorMessage, ipc } from '@/lib/ipc';
import { AuthLayout } from './AuthLayout';
import { RecoveryKeyInput } from '../setup/RecoveryKeyInput';

/** Shown when the database exists but this PC cannot read its key (e.g. after reinstalling Windows). */
export function RecoverScreen() {
  const setAppState = useSetAppState();
  const [recoveryKey, setRecoveryKey] = useState('');
  const unlock = useMutation({
    mutationFn: () => ipc('setup:unlock', { recoveryKey }),
    onSuccess: setAppState,
  });

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>Enter your recovery key</CardTitle>
          <CardDescription>
            The pharmacy data on this computer is encrypted, and this copy of Windows can't unlock
            it automatically. This usually happens after Windows is reinstalled or the data is moved
            to a new PC.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field
            label="Recovery key"
            hint="The 56-character key you printed or saved during setup."
          >
            <RecoveryKeyInput value={recoveryKey} onChange={setRecoveryKey} />
          </Field>
          {unlock.error && <Alert tone="danger">{errorMessage(unlock.error)}</Alert>}
          <Button
            size="lg"
            onClick={() => unlock.mutate()}
            loading={unlock.isPending}
            disabled={recoveryKey.length < 20}
          >
            Unlock
          </Button>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
