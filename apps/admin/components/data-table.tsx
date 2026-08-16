import { cn, EmptyState, Skeleton } from "@ride-it/ui";
import { Inbox } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowHref?: (row: T) => string;
  keyField: (row: T) => string;
  loading?: boolean;
  emptyLabel?: string;
}

export function DataTable<T>({
  columns,
  rows,
  keyField,
  loading = false,
  emptyLabel = "No records found",
}: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-ink/[0.02]">
              {columns.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-ink-soft">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-border last:border-b-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              rows.map((row) => (
                <tr
                  key={keyField(row)}
                  className="border-b border-border transition-colors last:border-b-0 hover:bg-ink/[0.02]"
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-4 py-3 text-ink", col.className)}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && (
        <EmptyState
          icon={<Inbox size={20} />}
          title={emptyLabel}
          description="New records will show up here as they come in."
        />
      )}
    </div>
  );
}
