import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, PackagePlus, Pencil, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { formatPercent } from '@shared/domain/gst';
import { packLabel } from '@shared/domain/items';
import { formatRupees } from '@shared/domain/money';
import type { BatchRow, ItemDetail, ItemRow } from '@shared/ipc/schemas/catalog';
import { queryKeys } from '@/app/queries';
import { useCan } from '@/app/session';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { describeQty } from '@/lib/format';
import { errorMessage, ipc } from '@/lib/ipc';
import { ExpiryBadge, StockBadge, useExpirySoonDate } from './badges';
import { ItemEditor } from './ItemEditor';
import { AddBatchDialog, AdjustDialog } from './StockDialogs';

/** Everything about one item: details, batches (with stock entry and adjustment) and alternatives. */
export function ItemDetailDialog({
  itemId,
  onClose,
  onOpenItem,
}: {
  itemId: number;
  onClose: () => void;
  onOpenItem: (id: number) => void;
}) {
  const client = useQueryClient();
  const canEdit = useCan('items.edit');
  const canAdjust = useCan('stock.adjust');
  const canSeeCost = useCan('cost.view');
  const [dialog, setDialog] = useState<'edit' | 'add' | { adjust: BatchRow } | null>(null);
  const { data: item, error } = useQuery({
    queryKey: [...queryKeys.items, 'detail', itemId],
    queryFn: () => ipc('items:get', { id: itemId }),
  });
  const { data: alternatives = [] } = useQuery({
    queryKey: [...queryKeys.items, 'alternatives', itemId],
    queryFn: () => ipc('items:alternatives', { id: itemId }),
  });
  const toggle = useMutation({
    mutationFn: (i: ItemDetail) => ipc('items:setActive', { id: i.id, active: !i.active }),
    onSuccess: (i) => {
      void client.invalidateQueries({ queryKey: queryKeys.items });
      toast.success(i.active ? 'Item is active again' : 'Item hidden from the POS');
    },
  });

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        title={item?.name ?? 'Item'}
        description={item?.genericNames.join(' + ') || undefined}
        className="max-w-4xl"
      >
        {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
        {item && (
          <Tabs defaultValue="details" className="flex flex-col gap-4">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="batches">Batches ({item.batches.length})</TabsTrigger>
              <TabsTrigger value="alternatives">Alternatives ({alternatives.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-3">
                <Detail label="Price per box">
                  {formatRupees(item.finalPriceBoxPaisa)}{' '}
                  <Badge tone={item.gstRateBp ? 'info' : 'neutral'}>
                    {item.gstRateBp
                      ? `${item.priceMode === 'add_gst' ? '+' : 'incl.'} GST ${formatPercent(item.gstRateBp)}`
                      : 'GST exempt'}
                  </Badge>
                </Detail>
                <Detail label="Pack">{packLabel(item)}</Detail>
                <Detail label="In stock">
                  <StockBadge
                    tabs={item.stockTabs}
                    reorderLevelTabs={item.reorderLevelTabs}
                    pack={item}
                  />
                </Detail>
                <Detail label="Company">{item.company || '—'}</Detail>
                <Detail label="Category">{item.category || '—'}</Detail>
                <Detail label="Rack">{item.rack || '—'}</Detail>
                <Detail label="Barcodes">{item.barcodes.join(', ') || '—'}</Detail>
                <Detail label="Reorder level">
                  {item.reorderLevelTabs ? describeQty(item.reorderLevelTabs, item) : '—'}
                </Detail>
                <Detail label="Prescription">
                  {item.rxRequired ? <Badge tone="warning">Required</Badge> : 'Not required'}
                </Detail>
              </dl>
              {!item.active && (
                <Alert tone="warning">This item is inactive and hidden from the POS.</Alert>
              )}
              {canEdit && (
                <div className="flex gap-2">
                  <Button onClick={() => setDialog('edit')}>
                    <Pencil /> Edit
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => toggle.mutate(item)}
                    loading={toggle.isPending}
                  >
                    {item.active ? <Archive /> : <ArchiveRestore />}{' '}
                    {item.active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="batches" className="flex flex-col gap-3">
              {canAdjust && (
                <Button className="self-start" onClick={() => setDialog('add')}>
                  <PackagePlus /> Add stock
                </Button>
              )}
              <div className="rounded-md border">
                <DataTable
                  rows={item.batches}
                  rowKey={(b) => b.id}
                  empty="No stock yet."
                  columns={[
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
                                onClick={() => setDialog({ adjust: b })}
                              >
                                <SlidersHorizontal /> Adjust
                              </Button>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            </TabsContent>

            <TabsContent value="alternatives">
              <p className="mb-3 text-sm text-muted-foreground">
                Other brands with the same generic and strength.
              </p>
              <div className="rounded-md border">
                <AlternativesTable rows={alternatives} onOpen={onOpenItem} />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </Dialog>
      {item && dialog === 'edit' && <ItemEditor item={item} onClose={() => setDialog(null)} />}
      {item && dialog === 'add' && <AddBatchDialog item={item} onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && (
        <AdjustDialog batch={dialog.adjust} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

export function AlternativesTable({
  rows,
  onOpen,
}: {
  rows: ItemRow[];
  onOpen?: (id: number) => void;
}) {
  const soon = useExpirySoonDate();
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      onRowClick={onOpen ? (r) => onOpen(r.id) : undefined}
      empty="No other brands with the same generic and strength."
      columns={[
        { key: 'name', header: 'Item', cell: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'company', header: 'Company', cell: (r) => r.company || '—' },
        {
          key: 'stock',
          header: 'Stock',
          cell: (r) => (
            <StockBadge tabs={r.stockTabs} reorderLevelTabs={r.reorderLevelTabs} pack={r} />
          ),
        },
        {
          key: 'expiry',
          header: 'Nearest expiry',
          cell: (r) => (
            <ExpiryBadge
              expiry={r.nearestExpiry}
              status={r.nearestExpiry && r.nearestExpiry <= soon ? 'near' : 'ok'}
            />
          ),
        },
        {
          key: 'price',
          header: 'Price / box',
          align: 'right',
          cell: (r) => formatRupees(r.finalPriceBoxPaisa),
        },
      ]}
    />
  );
}
