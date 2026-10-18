import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

export function StatCard({
  label,
  value,
  href,
  tone = 'default',
  icon,
}: {
  label: string;
  value: number | string;
  href?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  icon?: ReactNode;
}) {
  const tones = {
    default: 'border-line',
    warning: 'border-amber-300 dark:border-amber-800',
    danger: 'border-red-300 dark:border-red-800',
    success: 'border-emerald-300 dark:border-emerald-800',
  } as const;

  const body = (
    <div className={cn('card flex items-start justify-between gap-3 p-4', tones[tone])}>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      </div>
      {icon ? <span className="text-ink-muted">{icon}</span> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block transition-opacity hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}
