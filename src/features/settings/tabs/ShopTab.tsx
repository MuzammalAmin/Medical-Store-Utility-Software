import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { shopSettingsSchema, type Settings } from '@shared/settings';
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
import { errorMessage } from '@/lib/ipc';
import { useSaveSettings } from '../useSaveSettings';

export function ShopTab({ settings }: { settings: Settings }) {
  const save = useSaveSettings();
  const form = useForm<
    z.input<typeof shopSettingsSchema>,
    unknown,
    z.output<typeof shopSettingsSchema>
  >({
    resolver: zodResolver(shopSettingsSchema),
    defaultValues: settings.shop,
  });
  const { errors, isDirty } = form.formState;

  return (
    <form
      onSubmit={form.handleSubmit((value) =>
        save.mutate({ group: 'shop', value }, { onSuccess: (s) => form.reset(s.shop) }),
      )}
    >
      <Card>
        <CardHeader>
          <CardTitle>Shop profile</CardTitle>
          <CardDescription>Printed at the top and bottom of every receipt.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Shop name" error={errors.name?.message} className="sm:col-span-2">
            <Input {...form.register('name')} />
          </Field>
          <Field label="Address" error={errors.address?.message} className="sm:col-span-2">
            <Input {...form.register('address')} />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <Input {...form.register('phone')} />
          </Field>
          <Field label="Drug sale licence no." error={errors.licenceNo?.message}>
            <Input {...form.register('licenceNo')} />
          </Field>
          <Field label="NTN" error={errors.ntn?.message}>
            <Input {...form.register('ntn')} />
          </Field>
          <Field label="STRN" error={errors.strn?.message}>
            <Input {...form.register('strn')} />
          </Field>
          <Field
            label="Receipt footer"
            error={errors.receiptFooter?.message}
            className="sm:col-span-2"
          >
            <Input {...form.register('receiptFooter')} />
          </Field>
          {save.error && (
            <Alert tone="danger" className="sm:col-span-2">
              {errorMessage(save.error)}
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" loading={save.isPending} disabled={!isDirty}>
            Save
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
