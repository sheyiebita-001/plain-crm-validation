import { sendMagicLink } from './actions';

type SearchParams = { sent?: string; next?: string };

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sent = searchParams.sent === '1';

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-medium">Admin login</h1>
        <p className="mt-2 text-sm text-gray-500">
          {sent
            ? 'If that email is on the allowlist, a magic link is on its way. Check your inbox.'
            : 'Enter your admin email. We will send a one-time login link.'}
        </p>

        {!sent && (
          <form action={sendMagicLink} className="mt-6 space-y-4">
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <button
              type="submit"
              className="w-full rounded bg-black px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              Send magic link
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
