import { internalRoute } from '@/lib/internal-route';
import { runDailyReportWorkflow } from '@/lib/services/workflows';

export const dynamic = 'force-dynamic';

/** n8n workflow 6 — daily operations report. */
export async function POST(request: Request) {
  return internalRoute(() => runDailyReportWorkflow('n8n'), request);
}
