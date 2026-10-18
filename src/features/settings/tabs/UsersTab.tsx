import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ROLES, type Role } from '@shared/domain/permissions';
import { fullNameSchema, pinSchema, usernameSchema, type UserRow } from '@shared/ipc/contract';
import type { Settings } from '@shared/settings';
import { queryKeys } from '@/app/queries';
import { useSessionUser } from '@/app/session';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, PinInput } from '@/components/ui/input';
import { errorMessage, ipc } from '@/lib/ipc';
import { formatDateTime } from '@/lib/utils';

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including prices, profit, settings and backups',
  staff: 'Sell, look up items and take returns. No cost prices or settings',
};

export function UsersTab(_props: { settings: Settings }) {
  const me = useSessionUser();
  const [dialog, setDialog] = useState<
    { kind: 'create' } | { kind: 'edit' | 'pin'; user: UserRow } | null
  >(null);
  const { data: users = [], error } = useQuery({
    queryKey: queryKeys.users,
    queryFn: () => ipc('users:list'),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Everyone who uses the counter should have their own login.
          </CardDescription>
        </div>
        <Button onClick={() => setDialog({ kind: 'create' })}>
          <UserPlus /> Add user
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <Alert tone="danger" className="m-6">
            {errorMessage(error)}
          </Alert>
        )}
        <table className="w-full text-sm">
          <thead className="border-b bg-surface-muted text-left text-muted-foreground">
            <tr>
              <th className="px-6 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last login</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-6 py-2">
                  <p className="font-medium">
                    {u.fullName}{' '}
                    {u.id === me.id && <span className="text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{u.username}</p>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={u.role === 'owner' ? 'primary' : 'neutral'} className="capitalize">
                    {u.role}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={u.active ? 'success' : 'neutral'}>
                    {u.active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-3 py-2 tabular-nums">{formatDateTime(u.lastLoginAt)}</td>
                <td className="px-6 py-2 text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ kind: 'edit', user: u })}
                  >
                    <Pencil /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ kind: 'pin', user: u })}
                  >
                    <KeyRound /> Reset PIN
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>

      {dialog?.kind === 'create' && <CreateUserDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && (
        <EditUserDialog user={dialog.user} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'pin' && (
        <ResetPinDialog user={dialog.user} onClose={() => setDialog(null)} />
      )}
    </Card>
  );
}

function useInvalidateUsers() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.users });
    void client.invalidateQueries({ queryKey: queryKeys.loginUsers });
  };
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <div role="radiogroup" aria-label="Role" className="grid gap-2">
      {ROLES.map((role) => (
        <label
          key={role}
          className="flex cursor-pointer gap-3 rounded-md border p-3 has-checked:border-primary"
        >
          <input
            type="radio"
            checked={value === role}
            onChange={() => onChange(role)}
            className="mt-1 accent-[var(--primary)]"
          />
          <span>
            <span className="block text-sm font-medium capitalize">{role}</span>
            <span className="text-sm text-muted-foreground">{ROLE_HELP[role]}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

const createSchema = z
  .object({
    fullName: fullNameSchema,
    username: usernameSchema,
    role: z.enum(ROLES),
    pin: pinSchema,
    confirmPin: z.string(),
  })
  .refine((v) => v.pin === v.confirmPin, { path: ['confirmPin'], message: 'PINs do not match' });

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const invalidate = useInvalidateUsers();
  const form = useForm<z.input<typeof createSchema>, unknown, z.output<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { fullName: '', username: '', role: 'staff', pin: '', confirmPin: '' },
  });
  const create = useMutation({
    mutationFn: ({ confirmPin: _, ...input }: z.output<typeof createSchema>) =>
      ipc('users:create', input),
    onSuccess: (user) => {
      invalidate();
      toast.success(`${user.fullName} can now log in`);
      onClose();
    },
  });
  const { errors } = form.formState;
  const role = useWatch({ control: form.control, name: 'role' });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Add user">
      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
        <Field label="Full name" error={errors.fullName?.message}>
          <Input autoFocus {...form.register('fullName')} />
        </Field>
        <Field label="Username" error={errors.username?.message}>
          <Input autoCapitalize="none" spellCheck={false} {...form.register('username')} />
        </Field>
        <RoleSelect value={role} onChange={(next) => form.setValue('role', next)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="PIN" error={errors.pin?.message}>
            <PinInput {...form.register('pin')} />
          </Field>
          <Field label="Repeat PIN" error={errors.confirmPin?.message}>
            <PinInput {...form.register('confirmPin')} />
          </Field>
        </div>
        {create.error && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Add user
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditUserDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const invalidate = useInvalidateUsers();
  const [fullName, setFullName] = useState(user.fullName);
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.active);
  const nameError = fullNameSchema.safeParse(fullName).success
    ? undefined
    : 'Enter 2 to 60 characters';
  const update = useMutation({
    mutationFn: () => ipc('users:update', { id: user.id, fullName, role, active }),
    onSuccess: () => {
      invalidate();
      toast.success('User updated');
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={`Edit ${user.fullName}`}>
      <div className="flex flex-col gap-4">
        <Field label="Full name" error={nameError}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <RoleSelect value={role} onChange={setRole} />
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          Active (can log in)
        </label>
        {update.error && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => update.mutate()}
            loading={update.isPending}
            disabled={Boolean(nameError)}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ResetPinDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const valid = pinSchema.safeParse(pin).success && pin === confirm;
  const reset = useMutation({
    mutationFn: () => ipc('users:resetPin', { id: user.id, pin }),
    onSuccess: () => {
      toast.success(`New PIN set for ${user.fullName}`);
      onClose();
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Reset PIN for ${user.fullName}`}
      description="Use this when someone forgets their PIN. It also unlocks the account after too many wrong tries."
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="New PIN">
            <PinInput
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Field
            label="Repeat PIN"
            error={confirm && pin !== confirm ? 'PINs do not match' : undefined}
          >
            <PinInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
        </div>
        {reset.error && <Alert tone="danger">{errorMessage(reset.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => reset.mutate()} loading={reset.isPending} disabled={!valid}>
            Set PIN
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
