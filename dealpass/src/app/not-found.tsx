import Link from 'next/link';

/** Locale-agnostic fallback for unmatched paths outside `[locale]`. */
export default function NotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-surface p-8">
        <main className="text-center">
          <p className="text-sm font-semibold text-brand-700">404</p>
          <h1 className="mt-2 text-2xl font-bold text-ink">This page does not exist</h1>
          <p className="mt-2 text-sm text-ink-muted">
            The address may have changed, or the offer may have expired.
          </p>
          <Link href="/" className="btn-primary btn-md mt-6 inline-flex">
            Back to the homepage
          </Link>
        </main>
      </body>
    </html>
  );
}
