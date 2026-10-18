'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/types';

export function SearchBar({ locale, defaultValue = '' }: { locale: Locale; defaultValue?: string }) {
  const t = getDictionary(locale);
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  return (
    <form
      role="search"
      action={`/${locale}/search`}
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        router.push(query ? `/${locale}/search?q=${encodeURIComponent(query)}` : `/${locale}/search`);
      }}
      className="relative w-full"
    >
      <label htmlFor="site-search" className="sr-only">
        {t.search.placeholder}
      </label>
      <Search
        className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        aria-hidden="true"
      />
      <input
        id="site-search"
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t.search.placeholder}
        autoComplete="off"
        className="input h-10 ps-9 pe-4"
      />
    </form>
  );
}
