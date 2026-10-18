import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { pinSchema } from '@shared/ipc/contract';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { PinInput } from '@/components/ui/input';
import { errorMessage, ipc } from '@/lib/ipc';

const schema = z
  .object({ currentPin: pinSchema, newPin: pinSchema, confirmPin: z.string() })
  .refine((v) => v.newPin === v.confirmPin, { path: ['confirmPin'], message: 'PINs do not match' })
  .refine((v) => v.newPin !== v.currentPin, {
    path: ['newPin'],
    message: 'Choose a different PIN',
  });

export function ChangePinDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPin: '', newPin: '', confirmPin: '' },
  });
  const change = useMutation({
    mutationFn: (v: z.output<typeof schema>) =>
      ipc('auth:changeOwnPin', { currentPin: v.currentPin, newPin: v.newPin }),
    onSuccess: () => {
      toast.success('Your PIN has been changed');
      form.reset();
      onOpenChange(false);
    },
  });
  const { errors } = form.formState;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
      title="Change my PIN"
      description="Use 4 to 8 digits. Don't use your phone number or 1234."
    >
      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => change.mutate(v))}>
        <Field label="Current PIN" error={errors.currentPin?.message}>
          <PinInput autoFocus {...form.register('currentPin')} />
        </Field>
        <Field label="New PIN" error={errors.newPin?.message}>
          <PinInput {...form.register('newPin')} />
        </Field>
        <Field label="Repeat new PIN" error={errors.confirmPin?.message}>
          <PinInput {...form.register('confirmPin')} />
        </Field>
        {change.error && <Alert tone="danger">{errorMessage(change.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={change.isPending}>
            Change PIN
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
