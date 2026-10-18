import { internalRoute } from '@/lib/internal-route';
import { ingestError } from '@/lib/services/workflows';

export const dynamic = 'force-dynamic';

/**
 * n8n workflow 7 — central error handling.
 *
 * Every other workflow routes its failures here so alerts are recorded once,
 * in one place, instead of being scattered across eight scenarios.
 */
export async function POST(request: Request) {
  return internalRoute(async (payload) => {
    const message = typeof payload.message === 'string' ? payload.message : 'Unspecified workflow error';
    const workflow = typeof payload.workflow === 'string' ? payload.workflow : undefined;
    const raw = typeof payload.severity === 'string' ? payload.severity : 'error';
    const severity = (['info', 'warning', 'error', 'critical'] as const).includes(
      raw as (typeof SEVERITIES)[number],
    )
      ? (raw as (typeof SEVERITIES)[number])
      : 'error';

    const context =
      payload.context && typeof payload.context === 'object'
        ? (payload.context as Record<string, unknown>)
        : undefined;

    return ingestError({ workflow, severity, message, context });
  }, request);
}

const SEVERITIES = ['info', 'warning', 'error', 'critical'] as const;
