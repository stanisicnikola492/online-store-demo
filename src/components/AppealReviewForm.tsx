'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Line = { itemId: string; productName: string; requestedQuantity: number };

export function AppealReviewForm({
  appealId,
  lines,
  reviewerIsOriginal,
}: {
  appealId: string;
  lines: Line[];
  reviewerIsOriginal: boolean;
}) {
  const router = useRouter();
  const [overturn, setOverturn] = useState(true);
  const [picked, setPicked] = useState<string[]>(lines.map((l) => l.itemId));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/appeals/${appealId}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ overturn, itemIds: overturn ? picked : [], reason }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Review failed');
      return;
    }
    router.refresh();
  }

  if (reviewerIsOriginal) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        You rejected this request, so a second operator must review the appeal.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h2 className="font-medium">Second-opinion review</h2>

      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-1 text-sm">
          <input type="radio" checked={overturn} onChange={() => setOverturn(true)} />
          Overturn (approve selected items)
        </label>
        <label className="inline-flex items-center gap-1 text-sm">
          <input type="radio" checked={!overturn} onChange={() => setOverturn(false)} />
          Uphold rejection
        </label>
      </div>

      {overturn ? (
        <ul className="space-y-1 text-sm">
          {lines.map((line) => (
            <li key={line.itemId}>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={picked.includes(line.itemId)}
                  onChange={(e) =>
                    setPicked((prev) =>
                      e.target.checked ? [...prev, line.itemId] : prev.filter((id) => id !== line.itemId),
                    )
                  }
                />
                Approve {line.productName} ({line.requestedQuantity} unit(s))
              </label>
            </li>
          ))}
          {lines.length === 0 ? <li className="muted">No rejected items to restore.</li> : null}
        </ul>
      ) : null}

      <div>
        <label className="label" htmlFor="appeal-reason">
          Review reason
        </label>
        <textarea
          id="appeal-reason"
          className="field"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <button className="btn-primary" disabled={busy || (overturn && picked.length === 0) || reason.trim().length < 3}>
        {busy ? 'Saving…' : 'Record appeal decision'}
      </button>
    </form>
  );
}
