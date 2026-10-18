import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="card p-6 text-center text-sm text-ink-muted">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full min-w-[640px] border-collapse text-start text-sm">
        <thead className="bg-surface-alt">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="whitespace-nowrap px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className={cn('border-t border-line', index % 2 === 1 && 'bg-surface-alt/40')}
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2.5 align-middle text-ink">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
