import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { resolveOutboundUrl } from '@/lib/services/tracking';
import { detectDeviceType } from '@/lib/services/tracking';

export const dynamic = 'force-dynamic';

/**
 * Outbound affiliate redirect.
 *
 * Records the click, then 302s to the merchant. A noindex header is set so
 * search engines never crawl tracking URLs, and the destination link on the
 * page carries `rel="nofollow sponsored"`.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const url = await resolveOutboundUrl(id, {
    country: request.headers.get('x-vercel-ip-country') ?? undefined,
    language: request.nextUrl.searchParams.get('lang') ?? undefined,
    deviceType: detectDeviceType(request.headers.get('user-agent')),
    referrer: request.headers.get('referer'),
    campaign: request.nextUrl.searchParams.get('campaign'),
    userAgent: request.headers.get('user-agent'),
  });

  if (!url) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const response = NextResponse.redirect(url, 302);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}
