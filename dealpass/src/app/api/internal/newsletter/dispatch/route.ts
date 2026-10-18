import { internalRoute } from '@/lib/internal-route';
import { runNewsletterWorkflow } from '@/lib/services/workflows';
import { LOCALES, isLocale } from '@/lib/i18n/config';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * n8n workflow 5 — automated newsletter.
 *
 * Only confirmed subscribers are ever contacted. With no locale given, the
 * workflow runs once per supported language.
 */
export async function POST(request: Request) {
  return internalRoute(async (payload) => {
    const requested = typeof payload.locale === 'string' ? payload.locale : null;

    if (requested && isLocale(requested)) {
      return runNewsletterWorkflow(requested as Locale, 'n8n');
    }

    const results = [];
    for (const locale of LOCALES) {
      results.push({ locale, ...(await runNewsletterWorkflow(locale, 'n8n')) });
    }
    return { results };
  }, request);
}
