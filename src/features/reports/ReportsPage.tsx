import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { addDays, formatExpiry, todayIso } from '@shared/domain/dates';
import { formatRupees } from '@shared/domain/money';
import { STOCK_REPORTS, type ReportTable, type StockReportKind } from '@shared/ipc/schemas/reports';
import { PAYMENT_LABELS } from '@shared/ipc/schemas/sales';
import { queryKeys } from '@/app/queries';
import { useCan } from '@/app/session';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, Pager } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { docNo } from '@/lib/format';
import { errorMessage, ipc } from '@/lib/ipc';
import { formatDateTime } from '@/lib/utils';
import { InvoiceDialog } from '../sales/InvoiceDialog';

// ── Date range ─────────────────────────────────────────────────────────────

const PRESETS = ['today', 'yesterday', 'week', 'month', 'last_month', 'custom'] as const;
type Preset = (typeof PRESETS)[number];
const PRESET_LABELS: Record<Preset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Last 7 days',
  month: 'This month',
  last_month: 'Last month',
  custom: 'Custom dates',
};

function presetRange(preset: Preset, custom: { from: string; to: string }) {
  const today = todayIso();
  const [y, m] = today.split('-').map(Number) as [number, number];
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'week':
      return { from: addDays(today, -6), to: today };
    case 'month':
      return { from: monthStart, to: today };
    case 'last_month':
      return { from: addDays(monthStart, -1).slice(0, 8) + '01', to: addDays(monthStart, -1) };
    case 'custom':
      return custom;
  }
}

function useRange() {
  const [preset, setPreset] = useState<Preset>('today');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  const range = presetRange(preset, custom);
  const picker = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={preset}
        onChange={(e) => setPreset(e.target.value as Preset)}
        className="w-44"
        aria-label="Period"
      >
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {PRESET_LABELS[p]}
          </option>
        ))}
      </Select>
      {preset === 'custom' && (
        <>
          <Input
            type="date"
            aria-label="From"
            className="w-40"
            value={custom.from}
            max={custom.to}
            onChange={(e) => setCustom({ ...custom, from: e.target.value })}
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To"
            className="w-40"
            value={custom.to}
            min={custom.from}
            onChange={(e) => setCustom({ ...custom, to: e.target.value })}
          />
        </>
      )}
    </div>
  );
  const label = range.from === range.to ? range.from : `${range.from} to ${range.to}`;
  return { range, picker, label };
}

// ── Export ─────────────────────────────────────────────────────────────────

function ExportButtons({ table, subtitle }: { table: ReportTable | null; subtitle: string }) {
  const exp = useMutation({
    mutationFn: (format: 'xlsx' | 'csv' | 'pdf') =>
      ipc('reports:export', { table: table!, subtitle, format }),
    onSuccess: (r) => r.saved && toast.success('Report saved'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="flex gap-2">
      {(['xlsx', 'csv', 'pdf'] as const).map((f) => (
        <Button
          key={f}
          variant="secondary"
          size="sm"
          disabled={!table || table.rows.length === 0}
          onClick={() => exp.mutate(f)}
          loading={exp.isPending && exp.variables === f}
        >
          <FileDown /> {f === 'xlsx' ? 'Excel' : f.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}

function cellText(
  value: string | number | null | undefined,
  kind: ReportTable['columns'][number]['kind'],
) {
  if (value === null || value === undefined) return '—';
  if (kind === 'money' && typeof value === 'number') return formatRupees(value);
  if (kind === 'date' && typeof value === 'string') return formatExpiry(value);
  return String(value);
}

export function ReportTableView({ table }: { table: ReportTable }) {
  const align = (kind: string) => (kind === 'money' || kind === 'number' ? 'right' : 'left');
  return (
    <DataTable<Record<string, string | number | null> & { __i: number }>
      rows={table.rows.map((r, i) => ({ ...r, __i: i }))}
      rowKey={(r) => r.__i}
      empty="Nothing to report."
      columns={table.columns.map((c) => ({
        key: c.key,
        header: c.label,
        align: align(c.kind),
        cell: (r) => cellText(r[c.key], c.kind),
      }))}
      footer={
        table.totals && table.rows.length > 0 ? (
          <tfoot className="border-t-2 font-semibold">
            <tr>
              {table.columns.map((c) => (
                <td key={c.key} className={`px-4 py-2.5 tabular-nums text-${align(c.kind)}`}>
                  {table.totals?.[c.key] !== undefined ? cellText(table.totals[c.key], c.kind) : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : undefined
      }
    />
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Sales, profit, GST and stock. Every report can be exported."
      />
      <Tabs defaultValue="sales" className="flex flex-col gap-6">
        <TabsList>
          <TabsTrigger value="sales">Sales summary</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>
        <TabsContent value="sales">
          <SalesTab />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="stock">
          <StockTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function SalesTab() {
  const canSeeCost = useCan('cost.view');
  const { range, picker, label } = useRange();
  const { data: s, error } = useQuery({
    queryKey: [...queryKeys.reports, 'sales', range],
    queryFn: () => ipc('reports:salesSummary', range),
    placeholderData: keepPreviousData,
  });
  const table: ReportTable | null = s
    ? {
        title: 'Sales by day',
        columns: [
          { key: 'date', label: 'Date', kind: 'text' },
          { key: 'invoices', label: 'Invoices', kind: 'number' },
          { key: 'sales', label: 'Sales', kind: 'money' },
          { key: 'refunds', label: 'Refunds', kind: 'money' },
          { key: 'net', label: 'Net', kind: 'money' },
        ],
        rows: s.byDay.map((d) => ({
          date: d.date,
          invoices: d.invoices,
          sales: d.totalPaisa,
          refunds: d.refundsPaisa,
          net: d.totalPaisa - d.refundsPaisa,
        })),
        totals: {
          date: 'Total',
          invoices: s.invoices,
          sales: s.totalPaisa,
          refunds: s.refundsPaisa,
          net: s.netPaisa,
        },
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {picker}
        <ExportButtons table={table} subtitle={label} />
      </div>
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Net sales"
              value={formatRupees(s.netPaisa)}
              hint={`${s.invoices} invoices${s.voided ? ` · ${s.voided} voided` : ''}`}
            />
            <Stat label="GST collected" value={formatRupees(s.netGstPaisa)} hint="After refunds" />
            <Stat label="Discounts given" value={formatRupees(s.discountPaisa)} />
            <Stat label="Refunds" value={formatRupees(s.refundsPaisa)} />
            {canSeeCost && s.profitPaisa !== null && (
              <>
                <Stat label="Cost of goods sold" value={formatRupees(s.costPaisa ?? 0)} />
                <Stat
                  label="Gross profit"
                  value={formatRupees(s.profitPaisa)}
                  hint="Net sales − GST − cost"
                />
              </>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card>
              <CardHeader>
                <CardTitle>By day</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {table && <ReportTableView table={table} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By payment method</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {s.byMethod.length === 0 && <p className="text-muted-foreground">No payments.</p>}
                {s.byMethod.map((m) => (
                  <div key={m.method} className="flex justify-between">
                    <span>{PAYMENT_LABELS[m.method]}</span>
                    <span className="font-medium tabular-nums">{formatRupees(m.totalPaisa)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

function InvoicesTab() {
  const { range, picker, label } = useRange();
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [invoiceText, setInvoiceText] = useState('');
  const invoiceNo = Number(invoiceText.replace(/\D/g, '')) || null;
  const { data, error, isFetching } = useQuery({
    queryKey: [...queryKeys.sales, 'list', range, invoiceNo, page],
    queryFn: () => ipc('sales:list', { ...range, invoiceNo, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const table: ReportTable | null = data
    ? {
        title: 'Invoices',
        columns: [
          { key: 'no', label: 'Invoice', kind: 'text' },
          { key: 'at', label: 'Date & time', kind: 'text' },
          { key: 'cashier', label: 'Cashier', kind: 'text' },
          { key: 'method', label: 'Payment', kind: 'text' },
          { key: 'status', label: 'Status', kind: 'text' },
          { key: 'total', label: 'Total', kind: 'money' },
          { key: 'refunded', label: 'Refunded', kind: 'money' },
        ],
        rows: data.rows.map((r) => ({
          no: docNo(r.invoiceNo),
          at: formatDateTime(r.at),
          cashier: r.cashierName,
          method: PAYMENT_LABELS[r.paymentMethod],
          status: r.status,
          total: r.totalPaisa,
          refunded: r.refundedPaisa,
        })),
        totals: null,
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {picker}
          <Input
            placeholder="Invoice #"
            aria-label="Invoice number"
            className="w-32"
            inputMode="numeric"
            value={invoiceText}
            onChange={(e) => {
              setInvoiceText(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <ExportButtons table={table} subtitle={label} />
      </div>
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
      <Card>
        <DataTable
          rows={data?.rows ?? []}
          loading={isFetching}
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpen(r.invoiceNo)}
          empty="No invoices in this period."
          columns={[
            {
              key: 'no',
              header: 'Invoice',
              cell: (r) => <span className="font-medium">{docNo(r.invoiceNo)}</span>,
            },
            { key: 'at', header: 'Date & time', cell: (r) => formatDateTime(r.at) },
            { key: 'cashier', header: 'Cashier', cell: (r) => r.cashierName },
            { key: 'customer', header: 'Customer', cell: (r) => r.customerName || '—' },
            { key: 'lines', header: 'Lines', align: 'right', cell: (r) => r.lineCount },
            { key: 'method', header: 'Payment', cell: (r) => PAYMENT_LABELS[r.paymentMethod] },
            {
              key: 'total',
              header: 'Total',
              align: 'right',
              cell: (r) => (
                <span className="inline-flex items-center gap-2">
                  {r.status === 'void' && <Badge tone="danger">Void</Badge>}
                  {r.refundedPaisa > 0 && (
                    <Badge tone="warning">−{formatRupees(r.refundedPaisa)}</Badge>
                  )}
                  {formatRupees(r.totalPaisa)}
                </span>
              ),
            },
          ]}
        />
        <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
      </Card>
      {open !== null && <InvoiceDialog invoiceNo={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

const STOCK_LABELS: Record<StockReportKind, string> = {
  value: 'Stock value (all in-date stock)',
  near_expiry: 'Expiring soon',
  expired: 'Expired stock on the shelf',
  low: 'Low stock (reorder list)',
};

function StockTab() {
  const [kind, setKind] = useState<StockReportKind>('value');
  const { data, error, isFetching } = useQuery({
    queryKey: [...queryKeys.reports, 'stock', kind],
    queryFn: () => ipc('reports:stock', { kind }),
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as StockReportKind)}
          className="w-72"
          aria-label="Report"
        >
          {STOCK_REPORTS.map((k) => (
            <option key={k} value={k}>
              {STOCK_LABELS[k]}
            </option>
          ))}
        </Select>
        <ExportButtons table={data ?? null} subtitle={`As of ${todayIso()}`} />
      </div>
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
      <Card>
        {data ? (
          <ReportTableView table={data} />
        ) : (
          <DataTable rows={[]} rowKey={() => 0} columns={[]} loading={isFetching} />
        )}
      </Card>
    </div>
  );
}
