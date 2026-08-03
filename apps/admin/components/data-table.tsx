import { cn } from "@ride-it/ui";

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
}

export function DataTable<T>({ columns, rows, getRowHref, keyField }: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-ink/[0.02]">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-2.5 text-xs font-medium text-ink-soft">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const content = (
              <tr key={keyField(row)} className="border-b border-border last:border-b-0 hover:bg-ink/[0.02]">
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-3 text-ink", col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
            return content;
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="py-8 text-center text-sm text-ink-soft">No records found.</p>
      )}
    </div>
  );
}
