import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { computePrice, parsePercent } from '@shared/domain/gst';
import { formatRupees } from '@shared/domain/money';
import { availableUnits, derivedUnitPrice } from '@shared/domain/units';
import { ITEM_FORMS, type ItemForm } from '@shared/import/template';
import type { ItemDetail, ItemInput } from '@shared/ipc/schemas/catalog';
import { queryKeys, useSettings } from '@/app/queries';
import { PriceModeField } from '@/components/pricing/PriceModeField';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput, paisaToText, rupeesToPaisa } from '@/components/ui/money-input';
import { Select } from '@/components/ui/select';
import { errorMessage, ipc } from '@/lib/ipc';

const list = (text: string, sep: RegExp) =>
  text
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

/** Add or edit an item, including the price & GST choice (PRD §3.1–3.2). */
export function ItemEditor({
  item,
  onClose,
  onSaved,
}: {
  item: ItemDetail | null;
  onClose: () => void;
  onSaved?: (item: ItemDetail) => void;
}) {
  const client = useQueryClient();
  const { data: settings } = useSettings();
  const tax = settings?.tax ?? { defaultPriceMode: 'add_gst' as const, defaultGstRateBp: 1800 };

  const [f, setF] = useState(() => ({
    brandName: item?.brandName ?? '',
    genericNames: item?.genericNames.join(' + ') ?? '',
    strength: item?.strength ?? '',
    form: item?.form ?? 'tablet',
    company: item?.company ?? '',
    category: item?.category ?? '',
    rack: item?.rack ?? '',
    tabsPerStrip: String(item?.tabsPerStrip ?? 10),
    stripsPerBox: String(item?.stripsPerBox ?? 1),
    priceMode: item?.priceMode ?? tax.defaultPriceMode,
    rate: String((item?.gstRateBp ?? tax.defaultGstRateBp) / 100),
    amount: item
      ? paisaToText(item.priceMode === 'add_gst' ? item.basePriceBoxPaisa : item.finalPriceBoxPaisa)
      : '',
    stripOverride: paisaToText(item?.stripOverridePaisa ?? null),
    tabOverride: paisaToText(item?.tabOverridePaisa ?? null),
    barcodes: item?.barcodes.join(', ') ?? '',
    reorderBoxes: item
      ? String(item.reorderLevelTabs / (item.tabsPerStrip * item.stripsPerBox))
      : '0',
    rxRequired: item?.rxRequired ?? false,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  const pack = {
    tabsPerStrip: Number(f.tabsPerStrip) || 1,
    stripsPerBox: Number(f.stripsPerBox) || 1,
  };
  const amountPaisa = rupeesToPaisa(f.amount);
  let rateBp: number | null = null;
  try {
    rateBp = parsePercent(f.rate);
  } catch {
    rateBp = null;
  }
  const units = availableUnits(pack);
  const perUnit =
    amountPaisa && rateBp !== null
      ? units
          .filter((u) => u !== 'box')
          .map(
            (u) =>
              `Per ${u} ${formatRupees(computePrice(f.priceMode, derivedUnitPrice(amountPaisa, u, pack), rateBp).finalPaisa)}`,
          )
          .join(' · ')
      : '';

  const save = useMutation({
    mutationFn: (input: ItemInput) => ipc('items:save', input),
    onSuccess: (saved) => {
      void client.invalidateQueries({ queryKey: queryKeys.items });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
      toast.success(item ? 'Item updated' : `${saved.name} added`);
      onSaved?.(saved);
      onClose();
    },
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const e: Record<string, string> = {};
    if (!f.brandName.trim()) e['brandName'] = 'Brand name is required';
    if (!Number.isInteger(pack.tabsPerStrip) || pack.tabsPerStrip < 1)
      e['tabsPerStrip'] = 'Whole number, 1 or more';
    if (!Number.isInteger(pack.stripsPerBox) || pack.stripsPerBox < 1)
      e['stripsPerBox'] = 'Whole number, 1 or more';
    if (!amountPaisa) e['amount'] = 'Enter a price above 0';
    if (rateBp === null) e['rate'] = 'Enter a rate between 0 and 100';
    const barcodes = list(f.barcodes, /[,\s]+/);
    if (barcodes.some((b) => !/^\d{6,14}$/.test(b))) e['barcodes'] = 'Barcodes are 6 to 14 digits';
    const reorder = Number(f.reorderBoxes);
    if (!Number.isInteger(reorder) || reorder < 0) e['reorder'] = 'Whole number of boxes';
    const strip = f.stripOverride ? rupeesToPaisa(f.stripOverride) : null;
    const tab = f.tabOverride ? rupeesToPaisa(f.tabOverride) : null;
    if (f.stripOverride && strip === null) e['stripOverride'] = 'Not a valid amount';
    if (f.tabOverride && tab === null) e['tabOverride'] = 'Not a valid amount';
    setErrors(e);
    if (Object.keys(e).length > 0 || !amountPaisa || rateBp === null) return;

    save.mutate({
      ...(item ? { id: item.id } : {}),
      brandName: f.brandName.trim(),
      genericNames: list(f.genericNames, /[+,]/),
      strength: f.strength.trim(),
      form: f.form,
      company: f.company.trim(),
      category: f.category.trim(),
      rack: f.rack.trim(),
      tabsPerStrip: pack.tabsPerStrip,
      stripsPerBox: pack.stripsPerBox,
      price: { priceMode: f.priceMode, gstRateBp: rateBp, amountBoxPaisa: amountPaisa },
      stripOverridePaisa: strip,
      tabOverridePaisa: tab,
      barcodes,
      reorderLevelTabs: reorder * pack.tabsPerStrip * pack.stripsPerBox,
      rxRequired: f.rxRequired,
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={item ? `Edit ${item.name}` : 'Add item'}
      className="max-w-3xl"
    >
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Brand name" error={errors['brandName']} className="sm:col-span-2">
            <Input
              autoFocus
              value={f.brandName}
              onChange={(e) => set('brandName', e.target.value)}
            />
          </Field>
          <Field label="Strength" hint="e.g. 500mg">
            <Input value={f.strength} onChange={(e) => set('strength', e.target.value)} />
          </Field>
          <Field label="Generic / salt" hint="Separate several with +" className="sm:col-span-2">
            <Input value={f.genericNames} onChange={(e) => set('genericNames', e.target.value)} />
          </Field>
          <Field label="Form">
            <Select value={f.form} onChange={(e) => set('form', e.target.value as ItemForm)}>
              {ITEM_FORMS.map((form) => (
                <option key={form} value={form}>
                  {form[0]!.toUpperCase() + form.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Company">
            <Input value={f.company} onChange={(e) => set('company', e.target.value)} />
          </Field>
          <Field label="Category">
            <Input value={f.category} onChange={(e) => set('category', e.target.value)} />
          </Field>
          <Field label="Rack / shelf">
            <Input value={f.rack} onChange={(e) => set('rack', e.target.value)} />
          </Field>
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold">Pack</legend>
          <Field label="Strips per box" error={errors['stripsPerBox']}>
            <Input
              inputMode="numeric"
              value={f.stripsPerBox}
              onChange={(e) => set('stripsPerBox', e.target.value)}
            />
          </Field>
          <Field
            label="Tablets per strip"
            hint="1 for syrups, creams…"
            error={errors['tabsPerStrip']}
          >
            <Input
              inputMode="numeric"
              value={f.tabsPerStrip}
              onChange={(e) => set('tabsPerStrip', e.target.value)}
            />
          </Field>
          <Field label="Reorder level (boxes)" error={errors['reorder']}>
            <Input
              inputMode="numeric"
              value={f.reorderBoxes}
              onChange={(e) => set('reorderBoxes', e.target.value)}
            />
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold">Price &amp; GST</legend>
          <Field
            label={
              f.priceMode === 'add_gst'
                ? 'Base price per box (before GST)'
                : 'Sale price per box (GST included)'
            }
            error={errors['amount']}
            className="max-w-xs"
          >
            <MoneyInput value={f.amount} onChange={(e) => set('amount', e.target.value)} />
          </Field>
          <PriceModeField
            mode={f.priceMode}
            onModeChange={(m) => set('priceMode', m)}
            rate={f.rate}
            onRateChange={(r) => set('rate', r)}
            previewAmountPaisa={amountPaisa ?? 0}
            rateError={errors['rate']}
          />
          {perUnit && <p className="text-sm text-muted-foreground">{perUnit}</p>}
          {units.length > 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {units.includes('strip') && (
                <Field
                  label="Strip price override"
                  hint="Optional, in the same mode as above"
                  error={errors['stripOverride']}
                >
                  <MoneyInput
                    value={f.stripOverride}
                    onChange={(e) => set('stripOverride', e.target.value)}
                  />
                </Field>
              )}
              {units.includes('tab') && (
                <Field
                  label="Tablet price override"
                  hint="Optional, in the same mode as above"
                  error={errors['tabOverride']}
                >
                  <MoneyInput
                    value={f.tabOverride}
                    onChange={(e) => set('tabOverride', e.target.value)}
                  />
                </Field>
              )}
            </div>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Barcodes"
            hint="Scan into this box; separate several with commas"
            error={errors['barcodes']}
          >
            <Input value={f.barcodes} onChange={(e) => set('barcodes', e.target.value)} />
          </Field>
          <label className="flex items-center gap-3 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={f.rxRequired}
              onChange={(e) => set('rxRequired', e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            Prescription required
          </label>
        </div>

        {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {item ? 'Save changes' : 'Add item'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
