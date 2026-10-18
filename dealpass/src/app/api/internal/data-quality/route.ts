import { internalRoute } from '@/lib/internal-route';
import { runDataQualityWorkflow } from '@/lib/services/workflows';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** n8n workflow 8 — data-quality audit. */
export async function POST(request: Request) {
  return internalRoute(() => runDataQualityWorkflow('n8n'), request);
}
