import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

import { formatPercent } from '@shared/domain/gst';
import { packLabel } from '@shared/domain/items';
import { formatRupees } from '@shared/domain/money';
import { ITEM_FILTERS } from '@shared/ipc/schemas/catalog';
import { queryKeys } from '@/app/queries';
import { useCan } from '@/app/session';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, Pager } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { errorMessage, ipc } from '@/lib/ipc';
import { ExpiryBadge, StockBadge, useExpirySoonDate } from './badges';
import { ItemDetailDialog } from './ItemDetailDialog';
import { ItemEditor } from './ItemEditor';

const FILTER_LABELS: Record<(typeof ITEM_FILTERS)[number], string> = {
  all: 'All active items',
  low: 'Low stock',
  out: 'Out of stock',
  inactive: 'Inactive items',
};
const PAGE_SIZE = 50;

export function ItemsPage() {
  const canEdit = useCan('items.edit');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof ITEM_FILTERS)[number]>('all');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const search = useDeferredValue(query.trim());

  const { data, error, isFetching } = useQuery({
    queryKey: [...queryKeys.items, 'list', search, filter, page],
    queryFn: () => ipc('items:list', { query: search, filter, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const soon = useExpirySoonDate();

  return (
    <>
      <PageHeader
        title="Items"
        description="Every medicine and product, with price, GST and stock."
        actions={
          canEdit && (
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add item
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-72 flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder="Search by brand, generic or barcode"
            aria-label="Search items"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Select
          value={filter}
          className="w-52"
          aria-label="Filter"
          onChange={(e) => {
            setFilter(e.target.value as typeof filter);
            setPage(0);
          }}
        >
          {ITEM_FILTERS.map((f) => (
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
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpenId(r.id)}
          empty={
            search || filter !== 'all'
              ? 'No items match.'
              : 'No items yet. Import your medicine list from Excel, or add items one by one.'
          }
          columns={[
            {
              key: 'name',
              header: 'Item',
              cell: (r) => (
                <div>
                  <p className="font-medium">
                    {r.name} {r.rxRequired && <Badge tone="warning">Rx</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.genericNames.join(' + ')}</p>
                </div>
              ),
            },
            { key: 'company', header: 'Company', cell: (r) => r.company || '—' },
            { key: 'pack', header: 'Pack', cell: (r) => packLabel(r) },
            {
              key: 'price',
              header: 'Price / box',
              align: 'right',
              cell: (r) => (
                <div>
                  <p>{formatRupees(r.finalPriceBoxPaisa)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.gstRateBp
                      ? `${r.priceMode === 'add_gst' ? '+' : 'incl.'} GST ${formatPercent(r.gstRateBp)}`
                      : 'GST exempt'}
                  </p>
                </div>
              ),
            },
            {
              key: 'stock',
              header: 'Stock',
              cell: (r) => (
                <StockBadge tabs={r.stockTabs} reorderLevelTabs={r.reorderLevelTabs} pack={r} />
              ),
            },
            {
              key: 'expiry',
              header: 'Next expiry',
              cell: (r) => (
                <ExpiryBadge
                  expiry={r.nearestExpiry}
                  status={r.nearestExpiry && r.nearestExpiry <= soon ? 'near' : 'ok'}
                />
              ),
            },
            { key: 'rack', header: 'Rack', cell: (r) => r.rack || '—' },
          ]}
        />
        <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
      </Card>
      {openId !== null && (
        <ItemDetailDialog
          key={openId}
          itemId={openId}
          onClose={() => setOpenId(null)}
          onOpenItem={setOpenId}
        />
      )}
      {adding && (
        <ItemEditor item={null} onClose={() => setAdding(false)} onSaved={(i) => setOpenId(i.id)} />
      )}
    </>
  );
}
