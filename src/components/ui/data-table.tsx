import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  loading?: boolean;
  footer?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

/** Plain, accessible table used by every list screen. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading,
  footer,
  rowClassName,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-surface-muted text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'px-4 py-2.5 font-medium whitespace-nowrap',
                  alignClass[c.align ?? 'left'],
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter') onRowClick(row);
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              className={cn(
                'border-b last:border-0',
                onRowClick &&
                  'cursor-pointer hover:bg-surface-muted focus-visible:bg-surface-muted',
                rowClassName?.(row),
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-4 py-2.5 tabular-nums',
                    alignClass[c.align ?? 'left'],
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
      {loading && rows.length === 0 && (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-label="Loading" />
        </div>
      )}
      {!loading && rows.length === 0 && (
        <div className="px-4 py-10 text-center text-muted-foreground">
          {empty ?? 'Nothing to show.'}
        </div>
      )}
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
      <span>
        {total === 0
          ? 'No results'
          : `${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)} of ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <span>
          Page {page + 1} of {pages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPage(page + 1)}
          disabled={page + 1 >= pages}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
