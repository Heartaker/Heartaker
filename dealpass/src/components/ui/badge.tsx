import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'brand' | 'accent' | 'neutral' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200',
  accent: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  success: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  warning: 'bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  danger: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn('badge', TONES[tone], className)}>{children}</span>;
}
