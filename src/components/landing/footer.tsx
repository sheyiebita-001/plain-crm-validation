import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-neutral-200 px-6 py-10 text-sm text-neutral-500">
      <div className="mx-auto flex max-w-3xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <p>Sheyi A &middot; Try Signal Bench</p>
        <div className="flex items-center gap-6">
          <Link href="/privacy" className="hover:text-neutral-900">
            Privacy
          </Link>
          <a
            href="mailto:sheyi@trysignalbench.com"
            className="hover:text-neutral-900"
          >
            sheyi@trysignalbench.com
          </a>
        </div>
      </div>
    </footer>
  );
}
