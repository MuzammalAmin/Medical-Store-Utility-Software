import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { fullNameSchema, pinSchema, usernameSchema } from '@shared/ipc/contract';
import { shopSettingsSchema, type ShopSettings } from '@shared/settings';
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
import { Input, PinInput } from '@/components/ui/input';

const schema = z
  .object({
    shop: shopSettingsSchema,
    owner: z.object({
      fullName: fullNameSchema,
      username: usernameSchema,
      pin: pinSchema,
      confirmPin: z.string(),
    }),
  })
  .refine((v) => v.owner.pin === v.owner.confirmPin, {
    path: ['owner', 'confirmPin'],
    message: 'PINs do not match',
  });

export type OwnerDetails = { fullName: string; username: string; pin: string };
type Value = { shop: ShopSettings; owner: OwnerDetails };

export function DetailsStep({
  initial,
  onBack,
  onNext,
}: {
  initial: Value | null;
  onBack: () => void;
  onNext: (value: Value) => void;
}) {
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      shop: initial?.shop ?? shopSettingsSchema.parse({}),
      owner: initial
        ? { ...initial.owner, confirmPin: initial.owner.pin }
        : { fullName: '', username: '', pin: '', confirmPin: '' },
    },
  });
  const { errors } = form.formState;

  return (
    <form
      onSubmit={form.handleSubmit(({ shop, owner: { confirmPin: _, ...owner } }) =>
        onNext({ shop, owner }),
      )}
      noValidate
    >
      <Card>
        <CardHeader>
          <CardTitle>Shop details and owner account</CardTitle>
          <CardDescription>
            The shop details print on every receipt. You can change them later in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-sm font-semibold text-muted-foreground uppercase">
              Shop
            </legend>
            <Field label="Shop name" error={errors.shop?.name?.message}>
              <Input {...form.register('shop.name')} />
            </Field>
            <Field label="Address" error={errors.shop?.address?.message}>
              <Input {...form.register('shop.address')} />
            </Field>
            <Field label="Phone" error={errors.shop?.phone?.message}>
              <Input inputMode="tel" {...form.register('shop.phone')} />
            </Field>
            <Field label="Drug sale licence no." error={errors.shop?.licenceNo?.message}>
              <Input {...form.register('shop.licenceNo')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="NTN" hint="Optional" error={errors.shop?.ntn?.message}>
                <Input {...form.register('shop.ntn')} />
              </Field>
              <Field label="STRN" hint="Optional" error={errors.shop?.strn?.message}>
                <Input {...form.register('shop.strn')} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-sm font-semibold text-muted-foreground uppercase">
              Owner account
            </legend>
            <Field label="Full name" error={errors.owner?.fullName?.message}>
              <Input autoFocus {...form.register('owner.fullName')} />
            </Field>
            <Field
              label="Username"
              hint="Lowercase, e.g. ayyaz"
              error={errors.owner?.username?.message}
            >
              <Input
                autoCapitalize="none"
                spellCheck={false}
                {...form.register('owner.username')}
              />
            </Field>
            <Field
              label="PIN"
              hint="4 to 8 digits. Needed for refunds, voids and settings."
              error={errors.owner?.pin?.message}
            >
              <PinInput {...form.register('owner.pin')} />
            </Field>
            <Field label="Repeat PIN" error={errors.owner?.confirmPin?.message}>
              <PinInput {...form.register('owner.confirmPin')} />
            </Field>
          </fieldset>
        </CardContent>
        <CardFooter className="justify-between">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button type="submit">Continue</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
