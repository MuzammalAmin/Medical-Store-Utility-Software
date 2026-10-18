import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { useDeferredValue, useState, type KeyboardEvent, type Ref } from 'react';
import { formatExpiry } from '@shared/domain/dates';
import { describeQty } from '@shared/domain/items';
import { formatRupees } from '@shared/domain/money';
import type { PosItem } from '@shared/ipc/schemas/sales';
import { Badge } from '@/components/ui/badge';
import { errorMessage, ipc } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import { defaultUnit } from './usePosCart';

interface ProductSearchProps {
  ref?: Ref<HTMLInputElement>;
  onPick: (item: PosItem) => void;
  onHighlight: (item: PosItem | null) => void;
}

/**
 * Search box for barcode scanners and typing (F2). A scanner types the
 * barcode and presses Enter, which adds the exact match straight away.
 */
export function ProductSearch({ ref, onPick, onHighlight }: ProductSearchProps) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const query = useDeferredValue(text.trim());
  const {
    data: results = [],
    isFetching,
    error,
  } = useQuery({
    queryKey: ['pos', 'search', query],
    queryFn: () => ipc('pos:search', { query }),
    enabled: query.length > 0,
    staleTime: 5_000,
  });
  const open = query.length > 0;

  const pick = (item: PosItem | undefined) => {
    if (!item) return;
    onPick(item);
    setText('');
    setActive(0);
    onHighlight(null);
  };

  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open || results.length === 0) return;
      event.preventDefault();
      const next =
        (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      setActive(next);
      onHighlight(results[next] ?? null);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const typed = text.trim();
      if (!typed) return;
      // A scanner is faster than the deferred search: look the barcode up directly.
      const fresh =
        typed === query && results.length > 0 ? results : await ipc('pos:search', { query: typed });
      pick(fresh[typed === query ? active : 0]);
    } else if (event.key === 'Escape') {
      setText('');
      onHighlight(null);
    }
  };

  return (
    <div className="relative">
      <Search
        className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={ref}
        autoFocus
        role="combobox"
        aria-expanded={open}
        aria-controls="pos-results"
        aria-label="Scan barcode or search brand / generic"
        placeholder="Scan barcode or search brand / generic…  (F2)"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => void onKeyDown(e)}
        className="h-14 w-full rounded-lg border-2 bg-surface pr-12 pl-12 text-lg shadow-xs focus:border-primary focus:outline-none"
      />
      {isFetching && (
        <Loader2 className="absolute top-1/2 right-4 size-5 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && (
        <ul
          id="pos-results"
          role="listbox"
          className="absolute z-30 mt-1 max-h-[60vh] w-full overflow-y-auto rounded-lg border bg-surface shadow-lg"
        >
          {error && <li className="p-4 text-danger">{errorMessage(error)}</li>}
          {!isFetching && results.length === 0 && !error && (
            <li className="p-4 text-muted-foreground">No items found for “{query}”.</li>
          )}
          {results.map((item, i) => {
            const unit = defaultUnit(item);
            const first = item.batches[0];
            return (
              <li
                key={item.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
                onMouseEnter={() => {
                  setActive(i);
                  onHighlight(item);
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-4 border-b px-4 py-3 last:border-0',
                  i === active && 'bg-primary-soft/50',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.name} {item.rxRequired && <Badge tone="warning">Rx</Badge>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {item.genericNames.join(' + ') || '—'}
                    {item.rack && ` · Rack ${item.rack}`}
                  </p>
                </div>
                <div className="text-right text-sm">
                  {item.stockTabs === 0 ? (
                    <Badge tone="danger">Out of stock</Badge>
                  ) : (
                    <>
                      <p className="font-medium tabular-nums">
                        {first ? `${formatRupees(first.unitFinal[unit])} / ${unit}` : ''}
                      </p>
                      <p className="text-muted-foreground">
                        {describeQty(item.stockTabs, item)}
                        {first && ` · exp ${formatExpiry(first.expiry)}`}
                        {first?.nearExpiry && ' ⚠'}
                      </p>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
