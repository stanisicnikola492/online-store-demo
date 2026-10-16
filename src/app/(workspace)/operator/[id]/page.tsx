import { requireRole } from '@/lib/auth/session';
import { loadRequestView } from '@/modules/returns/view';
import { RequestView } from '@/components/RequestView';
import { DecisionForm } from '@/components/DecisionForm';
import { AppealReviewForm } from '@/components/AppealReviewForm';
import { Action } from '@/components/Action';

export default async function OperatorRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole('OPERATOR');
  const data = await loadRequestView(id, user, ['OPERATOR']);

  let actions: React.ReactNode = null;
  if (data.status === 'SUBMITTED') {
    actions = (
      <>
        <h2 className="font-medium">Ready for review</h2>
        <Action path={`/api/returns/${data.id}/review`}>Start review</Action>
      </>
    );
  } else if (data.status === 'UNDER_REVIEW') {
    actions = (
      <DecisionForm
        requestId={data.id}
        lines={data.items.map((i) => ({
          itemId: i.id,
          productName: i.productName,
          requestedQuantity: i.requestedQuantity,
        }))}
      />
    );
  } else if (data.status === 'APPEALED' && data.appeals[0]) {
    actions = (
      <AppealReviewForm
        appealId={data.appeals[0].id}
        reviewerIsOriginal={data.reviewedById === user.id}
        lines={data.items
          .filter((i) => i.decision === 'REJECTED')
          .map((i) => ({ itemId: i.id, productName: i.productName, requestedQuantity: i.requestedQuantity }))}
      />
    );
  } else {
    actions = <p className="muted">No operator action is available in this state.</p>;
  }

  return <RequestView data={data} actions={actions} />;
}
