import Link from 'next/link';

export default function LocaleNotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-3xl font-bold text-ink">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        This page does not exist, or the offer you were looking for has expired and been
        removed from the listings.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn-primary btn-md">Homepage</Link>
        <Link href="/offers" className="btn-outline btn-md">Browse offers</Link>
      </div>
    </div>
  );
}
