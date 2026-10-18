'use client';

import { useTransition, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Invokes a server action and reports the outcome inline.
 * Permissions are re-checked server-side inside the action — this component
 * only decides what to show.
 */
export function ActionButton({
  label,
  action,
  variant = 'outline',
  confirm,
  className,
}: {
  label: string;
  action: () => Promise<{ ok: boolean; message: string }>;
  variant?: 'primary' | 'outline' | 'danger' | 'accent';
  confirm?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const variants = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800',
    accent: 'bg-accent-500 text-white hover:bg-accent-600',
    outline: 'border border-line bg-surface text-ink hover:bg-surface-alt',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  } as const;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setResult(null);
          startTransition(async () => {
            const outcome = await action();
            setResult(outcome);
          });
        }}
        className={cn(
          'inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
          variants[variant],
          className,
        )}
      >
        {pending ? '…' : label}
      </button>
      {result && !result.ok ? (
        <span role="alert" className="max-w-xs text-[11px] text-red-600">
          {result.message}
        </span>
      ) : null}
    </span>
  );
}
