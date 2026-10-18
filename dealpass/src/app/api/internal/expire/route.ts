import { internalRoute } from '@/lib/internal-route';
import { runExpirationWorkflow } from '@/lib/services/workflows';

export const dynamic = 'force-dynamic';

/** n8n workflow 2 — expiration management. */
export async function POST(request: Request) {
  return internalRoute(() => runExpirationWorkflow('n8n'), request);
}
