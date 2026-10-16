import { requireRole } from '@/lib/auth/session';
import { loadRequestView } from '@/modules/returns/view';
import { RequestView } from '@/components/RequestView';
import { DraftEditor } from '@/components/DraftEditor';
import { AppealForm } from '@/components/AppealForm';
import { Action } from '@/components/Action';
import { returnableItems } from '@/modules/returns/service';

const CANCELLABLE = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED'];

export default async function CustomerRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole('CUSTOMER');
  const data = await loadRequestView(id, user, ['CUSTOMER']);

  let actions: React.ReactNode = null;

  if (data.status === 'DRAFT') {
    const available = await returnableItems(data.orderId, user);
    const maxByLine = new Map(available.map((a) => [a.orderItemId, a.availableQuantity]));
    actions = (
      <>
        <h2 className="font-medium">Finish your draft</h2>
        <DraftEditor
          requestId={data.id}
          orderId={data.orderId}
          initialNotes={data.notes ?? ''}
          lines={data.items.map((i) => ({
            orderItemId: i.orderItemId,
            productName: i.productName,
            availableQuantity: maxByLine.get(i.orderItemId) ?? i.requestedQuantity,
            quantity: i.requestedQuantity,
            reason: i.reason,
          }))}
        />
      </>
    );
  } else if (data.status === 'FULLY_REJECTED' && data.appeals.length === 0) {
    actions = (
      <>
        <h2 className="font-medium">You can appeal this rejection once</h2>
        <AppealForm requestId={data.id} />
      </>
    );
  } else if (CANCELLABLE.includes(data.status)) {
    actions = (
      <>
        <h2 className="font-medium">Cancel this request</h2>
        <Action
          className="btn-danger"
          path={`/api/returns/${data.id}/cancel`}
          confirm="Cancel this return request? This cannot be undone."
          body={{ reason: 'Customer cancelled the request' }}
          redirectTo="/customer/requests"
        >
          Cancel request
        </Action>
      </>
    );
  } else if (data.appeals.length > 0 && data.appeals[0].status === 'PENDING') {
    actions = <p className="muted">Your appeal is waiting for a second-opinion review by another operator.</p>;
  }

  return <RequestView data={data} actions={actions} />;
}
