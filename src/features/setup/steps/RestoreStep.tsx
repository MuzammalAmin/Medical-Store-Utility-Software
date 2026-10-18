import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { queryKeys } from '@/app/queries';
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
import { errorMessage, ipc } from '@/lib/ipc';
import { RecoveryKeyInput } from '../RecoveryKeyInput';

export function RestoreStep({ onBack }: { onBack: () => void }) {
  const client = useQueryClient();
  const [recoveryKey, setRecoveryKey] = useState('');
  const restore = useMutation({
    mutationFn: () => ipc('setup:restore', { recoveryKey }),
    onSuccess: ({ restored }) => {
      if (restored) void client.invalidateQueries({ queryKey: queryKeys.appState });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restore from a backup</CardTitle>
        <CardDescription>
          Enter the recovery key, then choose the backup file (ending in .apbak) from your USB
          drive.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field label="Recovery key">
          <RecoveryKeyInput autoFocus value={recoveryKey} onChange={setRecoveryKey} />
        </Field>
        {restore.error && <Alert tone="danger">{errorMessage(restore.error)}</Alert>}
        {restore.data && !restore.data.restored && <Alert tone="info">No file was chosen.</Alert>}
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          size="lg"
          onClick={() => restore.mutate()}
          loading={restore.isPending}
          disabled={recoveryKey.length < 20}
        >
          <FolderOpen /> Choose backup file
        </Button>
      </CardFooter>
    </Card>
  );
}
