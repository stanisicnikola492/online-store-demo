import { requireRole } from '@/lib/auth/session';
import { loadRequestView } from '@/modules/returns/view';
import { RequestView } from '@/components/RequestView';
import { Action } from '@/components/Action';
import { Pill } from '@/components/ui';

export default async function FinanceRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole('FINANCE');
  const data = await loadRequestView(id, user, ['FINANCE']);
  const refund = data.refunds[0];

  let actions: React.ReactNode = <p className="muted">No refund is queued for this request yet.</p>;

  if (refund) {
    if (refund.status === 'UNCERTAIN') {
      actions = (
        <>
          <h2 className="font-medium">Uncertain outcome</h2>
          <p className="muted text-sm">
            The provider did not answer the previous attempt, so the payout may already have happened.
            Reconcile first: this asks the provider what it recorded for{' '}
            <code>{refund.idempotencyKey}</code>. Retrying without reconciling would reuse the same key.
          </p>
          <Action path={`/api/refunds/${refund.id}/reconcile`} expectDelayMs={2500}>
            Reconcile with provider
          </Action>
        </>
      );
    } else if (refund.status === 'PROCESSING') {
      actions = (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          An attempt is in flight. Reload in a moment; if it stays like this, reconcile from the queue.
        </p>
      );
    } else if (refund.status === 'SUCCEEDED') {
      actions = (
        <p className="muted">
          Settled with the provider. <Pill tone="green">no further action</Pill>
        </p>
      );
    } else {
      actions = (
        <>
          <h2 className="font-medium">Send the refund</h2>
          <p className="muted text-sm">
            Paid back to the original method ({refund.paymentMethod ?? 'on the order'}) using idempotency
            key <code>{refund.idempotencyKey}</code>. The key never changes between attempts, so a
            repeated click cannot create a second payout.
          </p>
          <Action
            path={`/api/refunds/${refund.id}/initiate`}
            expectDelayMs={2500}
            body={{ refundId: refund.id }}
          >
            {refund.status === 'FAILED' ? 'Retry payout' : 'Initiate payout'}
          </Action>
          {refund.failureReason ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Last failure: {refund.failureReason}
            </p>
          ) : null}
        </>
      );
    }
  }

  return <RequestView data={data} actions={actions} />;
}
