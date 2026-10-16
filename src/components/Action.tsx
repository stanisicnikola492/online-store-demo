'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  path: string;
  method?: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  confirm?: string;
  expectDelayMs?: number;
  children: React.ReactNode;
  className?: string;
  redirectTo?: string;
  onDone?: (ok: boolean) => void;
};

/** One button, one mutation: posts to a route handler, surfaces the server error, then refreshes. */
export function Action({
  path,
  method = 'POST',
  body,
  confirm,
  expectDelayMs,
  children,
  className = 'btn-primary',
  redirectTo,
  onDone,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  async function run(e: React.MouseEvent) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError(null);
    setElapsed(0);
    const started = Date.now();
    const ticker = expectDelayMs ? setInterval(() => setElapsed(Math.round((Date.now() - started) / 100) / 10), 100) : null;

    try {
      const res = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        onDone?.(false);
        return;
      }
      onDone?.(true);
      const target = data.redirectTo ?? redirectTo;
      router.refresh();
      // Pushing the route we are already on reuses the router's cached payload, which can paint a
      // stale layout (e.g. the unread badge) over the freshly refreshed page.
      if (target && target !== window.location.pathname) router.push(target);
    } catch {
      setError('Network error — the change may or may not have been saved. Reload to check.');
      onDone?.(false);
    } finally {
      if (ticker) clearInterval(ticker);
      setBusy(false);
    }
  }

  return (
    <>
      <button className={className} onClick={run} disabled={busy}>
        {busy ? (
          <span>
            Working…{expectDelayMs ? ` ${elapsed}s` : ''}
            {expectDelayMs && elapsed * 1000 > expectDelayMs ? ' (provider is slow)' : ''}
          </span>
        ) : (
          children
        )}
      </button>
      {error ? (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </>
  );
}
