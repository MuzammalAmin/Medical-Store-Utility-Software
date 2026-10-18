import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { PinInput } from '@/components/ui/input';
import { errorMessage } from '@/lib/ipc';

interface PinConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: (pin: string) => void;
}

/** Asks for the current user's PIN again before a sensitive action (PRD §6.2). */
export function PinConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger,
  pending,
  error,
  onConfirm,
}: PinConfirmDialogProps) {
  const [pin, setPin] = useState('');
  const close = (next: boolean) => {
    if (!next) setPin('');
    onOpenChange(next);
  };
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    onConfirm(pin);
    setPin('');
  };

  return (
    <Dialog open={open} onOpenChange={close} title={title} description={description}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="Your PIN">
          <PinInput
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        {error ? <Alert tone="danger">{errorMessage(error)}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={danger ? 'danger' : 'primary'}
            loading={pending}
            disabled={pin.length < 4}
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
