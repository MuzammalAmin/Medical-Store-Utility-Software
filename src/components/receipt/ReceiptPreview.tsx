import { useMutation, useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { errorMessage, ipc } from '@/lib/ipc';

export type ReceiptRef = { kind: 'sale' | 'return' | 'test'; id: number; copy?: boolean };

/**
 * Shows the 80mm receipt exactly as it prints. The HTML comes from the main
 * process and is shown in a sandboxed frame with scripts disabled.
 */
export function ReceiptPreview({
  receipt,
  onClose,
  title = 'Receipt',
}: {
  receipt: ReceiptRef | null;
  onClose: () => void;
  title?: string;
}) {
  const { data, error } = useQuery({
    queryKey: ['receipt', receipt],
    queryFn: () => ipc('receipt:html', receipt!),
    enabled: receipt !== null,
  });
  const print = useMutation({
    mutationFn: () => ipc('receipt:print', receipt!),
    onSuccess: () => toast.success('Sent to the printer'),
  });

  return (
    <Dialog
      open={receipt !== null}
      onOpenChange={(open) => !open && onClose()}
      title={title}
      className="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => print.mutate()} loading={print.isPending}>
            <Printer /> Print
          </Button>
        </>
      }
    >
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
      {print.error && <Alert tone="danger">{errorMessage(print.error)}</Alert>}
      <div className="flex justify-center rounded-md bg-surface-muted p-4">
        {data && (
          <iframe
            title="Receipt preview"
            sandbox=""
            srcDoc={data.html}
            className="h-[60vh] w-[80mm] rounded bg-white shadow"
          />
        )}
      </div>
    </Dialog>
  );
}
