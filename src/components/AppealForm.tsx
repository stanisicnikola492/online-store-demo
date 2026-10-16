'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AppealForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/returns/${requestId}/appeal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ comment }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Appeal failed');
      return;
    }
    setComment('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="label" htmlFor="appeal-comment">
        Why should the rejection be reviewed again? (one appeal only)
      </label>
      <textarea
        id="appeal-comment"
        className="field"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        required
      />
      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <button className="btn-primary" disabled={busy || comment.trim().length < 10}>
        {busy ? 'Sending…' : 'Send appeal'}
      </button>
    </form>
  );
}
