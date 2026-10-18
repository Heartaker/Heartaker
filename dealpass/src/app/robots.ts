import type { MetadataRoute } from 'next';

/**
 * Search engines are welcome on content, but not on internal routes,
 * search results, redirect handlers or the admin area.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dealpass.example';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/offers', '/stores', '/categories', '/p/'],
        disallow: [
          '/admin',
          '/admin/',
          '/search',
          '/go/',
          '/api/',
          '/account',
          '/favorites',
          '/sign-in',
          '/sign-up',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
