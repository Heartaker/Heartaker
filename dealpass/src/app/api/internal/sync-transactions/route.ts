import { internalRoute } from '@/lib/internal-route';
import { runTransactionSyncWorkflow } from '@/lib/services/workflows';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** n8n workflow 4 — transaction / commission synchronisation. */
export async function POST(request: Request) {
  return internalRoute(async (payload) => {
    const daysBack = typeof payload.daysBack === 'number' ? Math.min(90, Math.max(1, payload.daysBack)) : 3;
    return runTransactionSyncWorkflow(daysBack, 'n8n');
  }, request);
}
