import { Pill, StatusPill, formatDate, formatDateTime, humanStatus, money } from '@/components/ui';
import { Timeline } from '@/components/Timeline';
import type { HistoryRow } from '@/components/Timeline';

export type RequestViewData = {
  id: string;
  reference: string;
  status: string;
  overallReason: string;
  shippingPaidBy: string;
  returnShippingCost: number;
  notes: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  reviewedByName: string | null;
  order: { orderNumber: string; paymentMethod: string; currency: string; deliveredAt: Date | null };
  customerName: string;
  items: Array<{
    id: string;
    productName: string;
    requestedQuantity: number;
    reason: string;
    decision: string;
    approvedQuantity: number | null;
    decisionReason: string | null;
    receiptStatus: string;
    inspectionResult: string;
    refundPercentage: number | null;
    finalRefundAmount: number | null;
    inspectionComment: string | null;
  }>;
  refunds: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    idempotencyKey: string;
    providerRef: string | null;
    failureReason: string | null;
    attempts: Array<{ attemptNumber: number; outcome: string; providerCode: string | null; providerMessage: string | null; latencyMs: number | null; createdAt: Date }>;
  }>;
  appeals: Array<{ id: string; comment: string; status: string; reviewReason: string | null; createdAt: Date; reviewerName: string | null }>;
  history: HistoryRow[];
};

export function RequestView({ data, actions }: { data: RequestViewData; actions?: React.ReactNode }) {
  const refund = data.refunds[0];

  return (
    <div className="space-y-4">
      <header className="card">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{data.reference}</h1>
          <StatusPill status={data.status} />
          <Pill tone="slate">shipping paid by {data.shippingPaidBy.toLowerCase()}</Pill>
        
        </div>
          <span className="muted ml-auto text-sm">
            {data.order.orderNumber} · {data.customerName} · created {formatDate(data.createdAt)}
          </span>
        <dl className="muted mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>Overall reason: {humanStatus(data.overallReason)}</div>
          <div>Delivered: {formatDate(data.order.deliveredAt)}</div>
          <div>Submitted: {formatDateTime(data.submittedAt)}</div>
          <div>Return shipping cost: {money(Number(data.returnShippingCost) * 100, data.order.currency)}</div>
          <div>Reviewed by: {data.reviewedByName ?? 'nobody yet'}</div>
          <div>Original payment method: {data.order.paymentMethod}</div>
        </dl>
        {data.notes ? <p className="mt-2 text-sm">Customer note: {data.notes}</p> : null}
      </header>

      <section className="card">
        <h2 className="mb-2 font-medium">Line items</h2>
        <div className="table-wrap">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-3">Item</th>
                <th className="py-1 pr-3">Requested</th>
                <th className="py-1 pr-3">Reason</th>
                <th className="py-1 pr-3">Decision</th>
                <th className="py-1 pr-3">Received</th>
                <th className="py-1 pr-3">Inspection</th>
                <th className="py-1 pr-3">Refund %</th>
                <th className="py-1">Amount</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {data.items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-medium">{item.productName}</td>
                  <td className="py-2 pr-3">{item.requestedQuantity}</td>
                  <td className="py-2 pr-3">{humanStatus(item.reason)}</td>
                  <td className="py-2 pr-3">
                    {item.decision === 'PENDING' ? (
                      <Pill tone="slate">pending</Pill>
                    ) : item.decision === 'APPROVED' ? (
                      <Pill tone="green">approved {item.approvedQuantity}</Pill>
                    ) : (
                      <Pill tone="red">rejected</Pill>
                    )}
                    {item.decisionReason ? (
                      <p className="muted mt-1 max-w-56 text-xs">{item.decisionReason}</p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{humanStatus(item.receiptStatus)}</td>
                  <td className="py-2 pr-3">
                    {humanStatus(item.inspectionResult)}
                    {item.inspectionComment ? (
                      <p className="muted mt-1 max-w-56 text-xs">{item.inspectionComment}</p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{item.refundPercentage === null ? '—' : `${item.refundPercentage}%`}</td>
                  <td className="py-2">
                    {item.finalRefundAmount === null ? '—' : money(Number(item.finalRefundAmount) * 100, data.order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {refund ? (
        <section className="card space-y-2">
          <h2 className="font-medium">Refund</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusPill status={refund.status} />
            <span className="font-medium">{money(Number(refund.amount) * 100, refund.currency)}</span>
            <Pill tone="slate">idempotency key {refund.idempotencyKey}</Pill>
            {refund.providerRef ? <Pill tone="blue">provider ref {refund.providerRef}</Pill> : null}
          </div>
          {refund.failureReason ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{refund.failureReason}</p>
          ) : null}
          <ul className="space-y-1 text-sm">
            {refund.attempts.map((a) => (
              <li key={a.attemptNumber} className="flex flex-wrap gap-2">
                <Pill tone={a.outcome === 'SUCCEEDED' ? 'green' : a.outcome === 'FAILED' ? 'red' : 'amber'}>
                  attempt {a.attemptNumber}: {a.outcome.toLowerCase()}
                </Pill>
                <span className="muted">
                  {a.providerCode} · {a.latencyMs === null ? 'no timing' : `${a.latencyMs} ms`} ·{' '}
                  {formatDateTime(a.createdAt)}
                </span>
                <span>{a.providerMessage}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.appeals.length > 0 ? (
        <section className="card space-y-2">
          <h2 className="font-medium">Appeal</h2>
          {data.appeals.map((a) => (
            <div key={a.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={a.status === 'PENDING' ? 'amber' : a.status === 'OVERTURNED' ? 'green' : 'red'}>
                  {humanStatus(a.status)}
                </Pill>
                <span className="muted">submitted {formatDateTime(a.createdAt)}</span>
                {a.reviewerName ? <span className="muted">· reviewed by {a.reviewerName}</span> : null}
              </div>
              <p className="mt-1">{a.comment}</p>
              {a.reviewReason ? <p className="muted mt-1">Review reason: {a.reviewReason}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      {actions ? <section className="card space-y-3">{actions}</section> : null}

      <section className="card">
        <h2 className="mb-2 font-medium">History</h2>
        <Timeline rows={data.history} />
      </section>
    </div>
  );
}
