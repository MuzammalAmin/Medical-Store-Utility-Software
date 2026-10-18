import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { formatRupees } from '@shared/domain/money';
import { BATCH_FILTERS, type BatchRow } from '@shared/ipc/schemas/catalog';
import { queryKeys } from '@/app/queries';
import { useCan } from '@/app/session';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, Pager } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { describeQty } from '@/lib/format';
import { errorMessage, ipc } from '@/lib/ipc';
import { ExpiryBadge } from '../items/badges';
import { ItemDetailDialog } from '../items/ItemDetailDialog';
import { AdjustDialog } from '../items/StockDialogs';

const FILTER_LABELS: Record<(typeof BATCH_FILTERS)[number], string> = {
  in_stock: 'In stock',
  near: 'Expiring soon',
  expired: 'Expired (still in stock)',
  all: 'All batches, including empty',
};
const PAGE_SIZE = 50;

/** Stock by batch, first expiry first (PRD §3.3). */
export function InventoryPage() {
  const canAdjust = useCan('stock.adjust');
  const canSeeCost = useCan('cost.view');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof BATCH_FILTERS)[number]>('in_stock');
  const [page, setPage] = useState(0);
  const [adjusting, setAdjusting] = useState<BatchRow | null>(null);
  const [openItem, setOpenItem] = useState<number | null>(null);
  const search = useDeferredValue(query.trim());

  const { data, error, isFetching } = useQuery({
    queryKey: [...queryKeys.inventory, search, filter, page],
    queryFn: () => ipc('inventory:batches', { query: search, filter, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock by batch, oldest expiry first. Expired batches can't be sold."
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-72 flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder="Search by brand or batch number"
            aria-label="Search stock"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Select
          value={filter}
          className="w-64"
          aria-label="Filter"
          onChange={(e) => {
            setFilter(e.target.value as typeof filter);
            setPage(0);
          }}
        >
          {BATCH_FILTERS.map((f) => (
            <option key={f} value={f}>
              {FILTER_LABELS[f]}
            </option>
          ))}
        </Select>
      </div>
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
      <Card>
        <DataTable
          rows={data?.rows ?? []}
          loading={isFetching}
          rowKey={(b) => b.id}
          onRowClick={(b) => setOpenItem(b.itemId)}
          empty="No batches match."
          columns={[
            {
              key: 'item',
              header: 'Item',
              cell: (b) => <span className="font-medium">{b.itemName}</span>,
            },
            { key: 'batch', header: 'Batch', cell: (b) => b.batchNo },
            {
              key: 'expiry',
              header: 'Expiry',
              cell: (b) => <ExpiryBadge expiry={b.expiry} status={b.status} />,
            },
            { key: 'qty', header: 'Quantity', cell: (b) => describeQty(b.qty, b) },
            {
              key: 'price',
              header: 'Price / box',
              align: 'right',
              cell: (b) => formatRupees(b.finalPriceBoxPaisa),
            },
            ...(canSeeCost
              ? [
                  {
                    key: 'cost',
                    header: 'Cost / box',
                    align: 'right' as const,
                    cell: (b: BatchRow) => formatRupees(b.costBoxPaisa ?? 0),
                  },
                ]
              : []),
            ...(canAdjust
              ? [
                  {
                    key: 'actions',
                    header: '',
                    align: 'right' as const,
                    cell: (b: BatchRow) => (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAdjusting(b);
                        }}
                      >
                        <SlidersHorizontal /> Adjust
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
        <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
      </Card>
      {adjusting && <AdjustDialog batch={adjusting} onClose={() => setAdjusting(null)} />}
      {openItem !== null && (
        <ItemDetailDialog
          key={openItem}
          itemId={openItem}
          onClose={() => setOpenItem(null)}
          onOpenItem={setOpenItem}
        />
      )}
    </>
  );
}
