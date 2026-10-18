import { query, queryOne } from '@/lib/db';
import type { Locale } from '@/lib/types';

export interface EditorialPage {
  id: string;
  slug: string;
  pageType: string;
  languageCode: string;
  title: string;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
}

/** Fetch a published page in the requested language, with a fallback chain. */
export async function getPage(slug: string, locale: Locale): Promise<EditorialPage | null> {
  const rows = await query<EditorialPage>(
    `SELECT p.id, p.slug, p.page_type AS "pageType", t.language_code AS "languageCode",
            t.title, t.body, t.seo_title AS "seoTitle", t.seo_description AS "seoDescription"
       FROM pages p
       JOIN page_translations t ON t.page_id = p.id
      WHERE p.slug = $1 AND p.status = 'published'`,
    [slug],
  );

  if (rows.length === 0) return null;

  const byLocale = new Map(rows.map((row) => [row.languageCode, row]));
  return byLocale.get(locale) ?? byLocale.get('en') ?? byLocale.get('fr') ?? rows[0]!;
}

/** Footer navigation — published pages flagged for the footer. */
export async function getFooterPages(locale: Locale): Promise<{ slug: string; title: string }[]> {
  return query<{ slug: string; title: string }>(
    `SELECT p.slug, t.title
       FROM pages p
       JOIN page_translations t ON t.page_id = p.id AND t.language_code = $1
      WHERE p.status = 'published' AND p.show_in_footer
      ORDER BY CASE p.page_type WHEN 'legal' THEN 0 WHEN 'editorial' THEN 1 ELSE 2 END, t.title`,
    [locale],
  );
}

/** All page slugs — used by the sitemap. */
export async function getPageSlugs(): Promise<string[]> {
  const rows = await query<{ slug: string }>(
    `SELECT slug FROM pages WHERE status = 'published' ORDER BY slug`,
  );
  return rows.map((row) => row.slug);
}

/** Very small Markdown subset: headings, paragraphs, bullets, bold, links. */
export function renderMarkdown(body: string): string {
  const escape = (value: string) =>
    value.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
    );

  const inline = (value: string) =>
    escape(value)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

  return body
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').filter((line) => line.trim() !== '');
      if (lines.length === 0) return '';

      if (lines.every((line) => line.startsWith('**') && line.includes('**'))) {
        return `<p>${lines.map(inline).join('<br />')}</p>`;
      }

      const listItems = lines.filter((line) => /^\d+\.\s|^[-*]\s/.test(line.trim()));
      if (listItems.length === lines.length) {
        const ordered = /^\d+\./.test(listItems[0]!.trim());
        const tag = ordered ? 'ol' : 'ul';
        return `<${tag} class="my-3 list-outside space-y-1.5 ${ordered ? 'list-decimal' : 'list-disc'} ps-5">
          ${listItems
            .map((item) => `<li>${inline(item.replace(/^\s*(?:\d+\.|[-*])\s+/, ''))}</li>`)
            .join('\n')}
        </${tag}>`;
      }

      return `<p class="my-3">${lines.map(inline).join('<br />')}</p>`;
    })
    .join('\n');
}
