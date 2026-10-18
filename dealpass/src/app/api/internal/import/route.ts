import { internalRoute } from '@/lib/internal-route';
import { runImportWorkflow } from '@/lib/services/workflows';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** n8n workflow 1 — automated offer import. */
export async function POST(request: Request) {
  return internalRoute(async (payload) => {
    const networkSlug = typeof payload.networkSlug === 'string' ? payload.networkSlug : undefined;
    return runImportWorkflow(networkSlug, 'n8n');
  }, request);
}
