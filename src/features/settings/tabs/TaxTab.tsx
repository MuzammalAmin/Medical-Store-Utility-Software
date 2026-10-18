import { useState } from 'react';
import { parsePercent, type PriceMode } from '@shared/domain/gst';
import type { Settings } from '@shared/settings';
import { PriceModeField } from '@/components/pricing/PriceModeField';
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
import { errorMessage } from '@/lib/ipc';
import { useSaveSettings } from '../useSaveSettings';

const PREVIEW_PAISA = { add_gst: 10_000, price_only: 11_800 } as const;

export function TaxTab({ settings }: { settings: Settings }) {
  const save = useSaveSettings();
  const [mode, setMode] = useState<PriceMode>(settings.tax.defaultPriceMode);
  const [rate, setRate] = useState(String(settings.tax.defaultGstRateBp / 100));
  const [rateError, setRateError] = useState<string>();

  const submit = () => {
    let rateBp: number;
    try {
      rateBp = parsePercent(rate);
    } catch {
      setRateError('Enter a rate between 0 and 100, e.g. 18 or 17.5');
      return;
    }
    setRateError(undefined);
    save.mutate({ group: 'tax', value: { defaultPriceMode: mode, defaultGstRateBp: rateBp } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default price mode and GST</CardTitle>
        <CardDescription>
          Pre-selected whenever a selling price is entered (new item, stock entry or import). The
          Owner can still change it for each item.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PriceModeField
          mode={mode}
          onModeChange={setMode}
          rate={rate}
          onRateChange={setRate}
          previewAmountPaisa={PREVIEW_PAISA[mode]}
          rateError={rateError}
        />
        {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
      </CardContent>
      <CardFooter>
        <Button onClick={submit} loading={save.isPending}>
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}
