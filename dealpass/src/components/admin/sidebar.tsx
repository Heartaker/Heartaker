'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, BarChart3, Link2, LogOut, Settings, ShieldCheck, Store, Tag, Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: 'offers' | 'review' | 'merchants' | 'connectors' | 'subscribers' | 'settings' | 'audit' | 'logs';
}

const ICONS = {
  offers: Tag,
  review: ShieldCheck,
  merchants: Store,
  connectors: Link2,
  subscribers: Users,
  settings: Settings,
  audit: Activity,
  logs: BarChart3,
} as const;

export function AdminSidebar({ items, locale }: { items: AdminNavItem[]; locale: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Administration" className="w-full shrink-0 lg:w-60">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-700 text-white'
                    : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminSignOut() {
  return (
    <form action="/api/auth/sign-out" method="post">
      <button
        type="submit"
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </button>
    </form>
  );
}
