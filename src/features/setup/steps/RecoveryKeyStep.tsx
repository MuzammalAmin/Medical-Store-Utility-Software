import { useMutation, useQuery } from '@tanstack/react-query';
import { FileDown, Printer } from 'lucide-react';
import { useState } from 'react';
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
import { errorMessage, ipc } from '@/lib/ipc';
import { RecoveryKeyDisplay } from '../RecoveryKeyDisplay';

export const recoveryKeyQuery = {
  queryKey: ['setup-recovery-key'],
  queryFn: () => ipc('setup:recoveryKey'),
};

export function RecoveryKeyStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { data, error } = useQuery({ ...recoveryKeyQuery, staleTime: Infinity });
  const [kept, setKept] = useState(false);
  const save = useMutation({
    mutationFn: () => ipc('setup:saveRecoveryKey'),
    onSuccess: (r) => r.saved && setKept(true),
  });
  const print = useMutation({
    mutationFn: () => ipc('setup:printRecoveryKey'),
    // Only a real print counts; closing the print dialog does not.
    onSuccess: (r) => r.printed && setKept(true),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Save your recovery key</CardTitle>
        <CardDescription>
          All pharmacy data and backups are encrypted. This key is the only way to open them on a
          new or reinstalled computer.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Alert tone="warning" title="Without this key, backups cannot be opened by anyone">
          Print it or save it to a USB drive, and keep it away from the shop computer. Nobody,
          including the app's developer, can recover it for you.
        </Alert>
        {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
        <RecoveryKeyDisplay value={data?.recoveryKey} />
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => print.mutate()}
            loading={print.isPending}
          >
            <Printer /> Print
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => save.mutate()}
            loading={save.isPending}
          >
            <FileDown /> Save to file / USB
          </Button>
        </div>
        {(save.error ?? print.error) && (
          <Alert tone="danger">{errorMessage(save.error ?? print.error)}</Alert>
        )}
        {kept && <Alert tone="success">Done. Keep that copy safe.</Alert>}
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!kept}
          title={kept ? undefined : 'Print or save the key first'}
        >
          I have saved it. Continue
        </Button>
      </CardFooter>
    </Card>
  );
}
