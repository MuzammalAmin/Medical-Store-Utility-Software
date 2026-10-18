import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  FolderOpen,
  Pencil,
  SkipForward,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { parsePercent, type PriceMode } from '@shared/domain/gst';
import { ITEM_IMPORT_COLUMNS, type ItemImportKey } from '@shared/import/template';
import {
  DUPLICATE_ACTIONS,
  type DuplicateAction,
  type ImportOpen,
  type ImportOptions,
  type ImportPreviewRow,
  type ImportResult,
} from '@shared/ipc/schemas/import';
import { queryKeys, useSettings } from '@/app/queries';
import { PriceModeField } from '@/components/pricing/PriceModeField';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DataTable, Pager } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { errorMessage, ipc } from '@/lib/ipc';
import { cn } from '@/lib/utils';

function percentOrNull(text: string): number | null {
  try {
    return parsePercent(text);
  } catch {
    return null;
  }
}

const STEPS = ['Upload', 'Map columns', 'GST & duplicates', 'Preview', 'Done'] as const;
const DUPLICATE_LABELS: Record<DuplicateAction, { title: string; help: string }> = {
  skip: { title: 'Skip', help: 'Leave the existing item and its stock unchanged' },
  update: {
    title: 'Update existing',
    help: 'Update the item details and price, and add the stock',
  },
  new: { title: 'Add as new', help: 'Create a separate item (barcode stays with the old one)' },
};

/** CSV / Excel import wizard (PRD §3.4, §5.3). Owner only. */
export function ImportPage() {
  const client = useQueryClient();
  const { data: settings } = useSettings();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<ImportOpen | null>(null);
  const [mapping, setMapping] = useState<ImportOptions['mapping']>({});
  const [mode, setMode] = useState<PriceMode | null>(null);
  const [rate, setRate] = useState<string | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>('update');
  const [overrides, setOverrides] = useState<ImportOptions['overrides']>({});
  const [skipRows, setSkipRows] = useState<number[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const defaultMode = mode ?? settings?.tax.defaultPriceMode ?? 'add_gst';
  const defaultRate = rate ?? String((settings?.tax.defaultGstRateBp ?? 1800) / 100);
  const rateBp = percentOrNull(defaultRate);
  const options: ImportOptions | null =
    file && rateBp !== null
      ? {
          jobId: file.jobId,
          mapping,
          defaultPriceMode: defaultMode,
          defaultGstRateBp: rateBp,
          duplicateAction,
          overrides,
          skipRows,
        }
      : null;

  const template = useMutation({
    mutationFn: (format: 'xlsx' | 'csv') => ipc('import:template', { format }),
    onSuccess: (r) => r.saved && toast.success('Template saved'),
  });
  const open = useMutation({
    mutationFn: () => ipc('import:open'),
    onSuccess: (opened) => {
      if (!opened) return;
      setFile(opened);
      setMapping(opened.suggested);
      setOverrides({});
      setSkipRows([]);
      setResult(null);
      setStep(1);
    },
  });
  const commit = useMutation({
    mutationFn: () => ipc('import:commit', options!),
    onSuccess: (r) => {
      setResult(r);
      setStep(4);
      for (const key of [
        queryKeys.items,
        queryKeys.inventory,
        queryKeys.dashboard,
        queryKeys.backupStatus,
      ]) {
        void client.invalidateQueries({ queryKey: key });
      }
    },
  });

  const restart = () => {
    setFile(null);
    setResult(null);
    setStep(0);
  };

  return (
    <>
      <PageHeader
        title="Import"
        description="Load your medicine list and opening stock from an Excel or CSV sheet."
      />
      <ol className="mb-6 flex items-center gap-2 text-sm" aria-label="Import progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className="flex flex-1 items-center gap-2"
            aria-current={i === step ? 'step' : undefined}
          >
            <span
              className={cn(
                'grid size-6 place-items-center rounded-full text-xs',
                i <= step ? 'bg-primary text-primary-foreground' : 'border text-muted-foreground',
              )}
            >
              {i + 1}
            </span>
            <span className={i <= step ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Upload a spreadsheet</CardTitle>
            <CardDescription>
              Use our template for the smoothest import, or your own sheet: you'll match its columns
              in the next step. Up to 10 MB and 50,000 rows. Formulas and macros are never run.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => template.mutate('xlsx')}
                loading={template.isPending && template.variables === 'xlsx'}
              >
                <FileDown /> Download Excel template
              </Button>
              <Button
                variant="secondary"
                onClick={() => template.mutate('csv')}
                loading={template.isPending && template.variables === 'csv'}
              >
                <FileDown /> Download CSV template
              </Button>
            </div>
            <Alert tone="info">
              Sample files for testing are in the project's{' '}
              <code className="font-mono">samples</code> folder.
            </Alert>
            {(open.error ?? template.error) && (
              <Alert tone="danger">{errorMessage(open.error ?? template.error)}</Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button size="lg" onClick={() => open.mutate()} loading={open.isPending}>
              <FolderOpen /> Choose file
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 1 && file && (
        <MappingStep
          file={file}
          mapping={mapping}
          onChange={setMapping}
          onBack={restart}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>GST and duplicates</CardTitle>
            <CardDescription>
              {mapping.gst_mode !== undefined || mapping.gst_rate !== undefined
                ? 'Rows with gst_mode / gst_rate in the sheet use those values. Rows where they are blank use this choice:'
                : 'Your sheet has no GST columns, so every row uses this choice:'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <PriceModeField
              mode={defaultMode}
              onModeChange={setMode}
              rate={defaultRate}
              onRateChange={setRate}
              previewAmountPaisa={defaultMode === 'add_gst' ? 10_000 : 11_800}
              rateError={rateBp === null ? 'Enter a rate between 0 and 100' : undefined}
            />
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">
                When a row matches an item you already have
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {DUPLICATE_ACTIONS.map((a) => (
                  <label
                    key={a}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-md border p-3',
                      duplicateAction === a && 'border-primary bg-primary-soft/40',
                    )}
                  >
                    <input
                      type="radio"
                      checked={duplicateAction === a}
                      onChange={() => setDuplicateAction(a)}
                      className="mt-1 accent-[var(--primary)]"
                    />
                    <span>
                      <span className="block text-sm font-medium">{DUPLICATE_LABELS[a].title}</span>
                      <span className="text-sm text-muted-foreground">
                        {DUPLICATE_LABELS[a].help}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={rateBp === null}>
              Check the rows
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 3 && options && (
        <PreviewStep
          options={options}
          onOverride={(rowNo, values) =>
            setOverrides((o) => ({ ...o, [String(rowNo)]: { ...o[String(rowNo)], ...values } }))
          }
          onToggleSkip={(rowNo) =>
            setSkipRows((s) => (s.includes(rowNo) ? s.filter((r) => r !== rowNo) : [...s, rowNo]))
          }
          onBack={() => setStep(2)}
          onImport={() => commit.mutate()}
          importing={commit.isPending}
          importError={commit.error}
        />
      )}

      {step === 4 && result && (
        <Card className="max-w-2xl">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <CheckCircle2 className="size-14 text-success" aria-hidden />
            <p className="text-xl font-semibold">Import finished</p>
            <div className="grid grid-cols-2 gap-x-10 gap-y-1 text-left text-sm sm:grid-cols-3">
              <span>
                Added: <b>{result.added}</b>
              </span>
              <span>
                Updated: <b>{result.updated}</b>
              </span>
              <span>
                Stock batches: <b>{result.batches}</b>
              </span>
              <span>
                Skipped: <b>{result.skipped}</b>
              </span>
              <span>
                Rejected: <b>{result.rejected}</b>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              A backup was made first: {result.backupFile}
            </p>
            <Button onClick={restart}>Import another file</Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function MappingStep({
  file,
  mapping,
  onChange,
  onBack,
  onNext,
}: {
  file: ImportOpen;
  mapping: ImportOptions['mapping'];
  onChange: (m: ImportOptions['mapping']) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const missing = ITEM_IMPORT_COLUMNS.filter((c) => c.required && mapping[c.key] === undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="size-4" aria-hidden /> {file.fileName} · {file.rowCount} rows
        </CardTitle>
        <CardDescription>
          Check which column of your sheet holds each field. Columns we recognised are already
          chosen.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        {ITEM_IMPORT_COLUMNS.map((c) => {
          const col = mapping[c.key];
          const example = col !== undefined ? file.sample.find((r) => r[col])?.[col] : undefined;
          return (
            <div key={c.key} className="grid grid-cols-[150px_1fr] items-center gap-3">
              <label htmlFor={`map-${c.key}`} className="text-sm">
                <span className="font-medium">{c.header}</span>
                {c.required && <span className="text-danger"> *</span>}
              </label>
              <div>
                <Select
                  id={`map-${c.key}`}
                  value={col ?? ''}
                  onChange={(e) => {
                    const { [c.key]: _old, ...rest } = mapping;
                    onChange(
                      e.target.value === '' ? rest : { ...rest, [c.key]: Number(e.target.value) },
                    );
                  }}
                >
                  <option value="">— not in my file —</option>
                  {file.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </Select>
                {example && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">e.g. {example}</p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="ghost" onClick={onBack}>
          Choose another file
        </Button>
        <div className="flex items-center gap-3">
          {missing.length > 0 && (
            <span className="text-sm text-danger">
              Choose: {missing.map((m) => m.header).join(', ')}
            </span>
          )}
          <Button onClick={onNext} disabled={missing.length > 0}>
            Continue
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

const FILTERS = ['all', 'ok', 'warning', 'error', 'skipped'] as const;
type Filter = (typeof FILTERS)[number];
const STATUS_TONE = {
  ok: 'success',
  warning: 'warning',
  error: 'danger',
  skipped: 'neutral',
} as const;
const STATUS_LABEL = {
  ok: '✓ Ready',
  warning: '⚠ Warning',
  error: '✕ Error',
  skipped: 'Skipped',
} as const;
const PREVIEW_PAGE = 100;

function PreviewStep({
  options,
  onOverride,
  onToggleSkip,
  onBack,
  onImport,
  importing,
  importError,
}: {
  options: ImportOptions;
  onOverride: (rowNo: number, values: Partial<Record<ItemImportKey, string>>) => void;
  onToggleSkip: (rowNo: number) => void;
  onBack: () => void;
  onImport: () => void;
  importing: boolean;
  importError: unknown;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<ImportPreviewRow | null>(null);
  const { data, error, isFetching } = useQuery({
    queryKey: ['import-preview', options],
    queryFn: () => ipc('import:preview', options),
    placeholderData: keepPreviousData,
  });
  const errorFile = useMutation({
    mutationFn: () => ipc('import:errorFile', options),
    onSuccess: (r) => r.saved && toast.success('Rejected rows saved'),
  });
  const rows = (data?.rows ?? []).filter((r) => filter === 'all' || r.status === filter);
  const counts = data?.counts;
  const importable = counts ? counts.ok + counts.warning : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
              setPage(0);
            }}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              filter === f
                ? 'border-primary bg-primary-soft text-primary'
                : 'hover:bg-surface-muted',
            )}
          >
            {f === 'all'
              ? `All ${data?.rows.length ?? ''}`
              : `${STATUS_LABEL[f]} ${counts?.[f] ?? 0}`}
          </button>
        ))}
        <div className="ml-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => errorFile.mutate()}
            disabled={!counts?.error}
            loading={errorFile.isPending}
          >
            <FileDown /> Download rejected rows
          </Button>
        </div>
      </div>
      {(error ?? importError) ? (
        <Alert tone="danger">{errorMessage(error ?? importError)}</Alert>
      ) : null}
      <Card>
        <DataTable
          rows={rows.slice(page * PREVIEW_PAGE, (page + 1) * PREVIEW_PAGE)}
          loading={isFetching}
          rowKey={(r) => r.rowNo}
          columns={[
            { key: 'row', header: 'Row', cell: (r) => r.rowNo },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
            },
            {
              key: 'item',
              header: 'Item',
              cell: (r) => (
                <span className="font-medium">
                  {[r.values.brand_name, r.values.strength].filter(Boolean).join(' ') || '—'}
                </span>
              ),
            },
            {
              key: 'price',
              header: 'Price / box',
              align: 'right',
              cell: (r) => r.values.sale_price_box || '—',
            },
            {
              key: 'stock',
              header: 'Stock',
              cell: (r) =>
                r.values.qty
                  ? `${r.values.qty} ${r.values.qty_unit || 'box'} · ${r.values.batch_no ?? ''}`
                  : '—',
            },
            {
              key: 'issues',
              header: 'Problems',
              cell: (r) => (
                <ul className="text-xs">
                  {r.issues.map((i, n) => (
                    <li key={n} className={i.level === 'error' ? 'text-danger' : 'text-warning'}>
                      {i.field ? `${i.field}: ` : ''}
                      {i.message}
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  {r.status !== 'skipped' && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                      <Pencil /> Fix
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onToggleSkip(r.rowNo)}>
                    {r.status === 'skipped' ? <Undo2 /> : <SkipForward />}{' '}
                    {r.status === 'skipped' ? 'Include' : 'Skip'}
                  </Button>
                </div>
              ),
            },
          ]}
        />
        <Pager page={page} pageSize={PREVIEW_PAGE} total={rows.length} onPage={setPage} />
      </Card>
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {counts && counts.error > 0 && (
            <span className="text-sm text-muted-foreground">
              {counts.error} rows with errors will not be imported.
            </span>
          )}
          <Button
            size="lg"
            onClick={onImport}
            loading={importing}
            disabled={importable === 0 || isFetching}
          >
            Import {importable} rows
          </Button>
        </div>
      </div>
      {editing && (
        <FixRowDialog
          row={editing}
          mapped={Object.keys(options.mapping) as ItemImportKey[]}
          onSave={(values) => {
            onOverride(editing.rowNo, values);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function FixRowDialog({
  row,
  mapped,
  onSave,
  onClose,
}: {
  row: ImportPreviewRow;
  mapped: ItemImportKey[];
  onSave: (values: Partial<Record<ItemImportKey, string>>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState(row.values);
  const errorFields = new Set(row.issues.map((i) => i.field));
  const keys = ITEM_IMPORT_COLUMNS.map((c) => c.key).filter(
    (k) => mapped.includes(k) || errorFields.has(k),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Fix row ${row.rowNo}`}
      description="Changes apply to this import only, not to your file."
      className="max-w-3xl"
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {keys.map((k) => (
            <Field
              key={k}
              label={k}
              error={row.issues.find((i) => i.field === k && i.level === 'error')?.message}
            >
              <Input
                value={values[k] ?? ''}
                onChange={(e) => setValues({ ...values, [k]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(values)}>Re-check row</Button>
        </div>
      </div>
    </Dialog>
  );
}
