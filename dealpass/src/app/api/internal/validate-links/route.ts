import { internalRoute } from '@/lib/internal-route';
import { runLinkValidationWorkflow } from '@/lib/services/workflows';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** n8n workflow 3 — affiliate link validation. */
export async function POST(request: Request) {
  return internalRoute(async (payload) => {
    const limit = typeof payload.limit === 'number' ? Math.min(200, Math.max(1, payload.limit)) : 40;
    return runLinkValidationWorkflow(limit, 'n8n');
  }, request);
}
