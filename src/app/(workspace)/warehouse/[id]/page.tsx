import { requireRole } from '@/lib/auth/session';
import { loadRequestView } from '@/modules/returns/view';
import { RequestView } from '@/components/RequestView';
import { ReceiptForm } from '@/components/ReceiptForm';
import { InspectionForm } from '@/components/InspectionForm';

export default async function WarehouseRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole('WAREHOUSE');
  const data = await loadRequestView(id, user, ['WAREHOUSE']);

  const approved = data.items.filter((i) => i.decision === 'APPROVED');
  let actions: React.ReactNode = null;

  if (['APPROVED', 'PARTIALLY_APPROVED'].includes(data.status)) {
    actions = (
      <ReceiptForm
        requestId={data.id}
        lines={approved
          .filter((i) => i.receiptStatus === 'AWAITING')
          .map((i) => ({ itemId: i.id, productName: i.productName, quantity: i.approvedQuantity ?? 0 }))}
      />
    );
  } else if (['RECEIVED', 'INSPECTING'].includes(data.status)) {
    actions = (
      <InspectionForm
        requestId={data.id}
        lines={approved
          .filter((i) => i.receiptStatus === 'RECEIVED' && i.inspectionResult === 'PENDING')
          .map((i) => ({
            itemId: i.id,
            productName: i.productName,
            quantity: i.approvedQuantity ?? 0,
            unitPrice: i.unitPrice,
            currency: data.order.currency,
          }))}
      />
    );
  } else {
    actions = <p className="muted">This request needs no warehouse action right now.</p>;
  }

  const rejected = approved.length === 0;
  return (
    <>
      {rejected && ['APPROVED', 'PARTIALLY_APPROVED', 'RECEIVED', 'INSPECTING'].includes(data.status) ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No approved lines remain to process.
        </p>
      ) : null}
      <RequestView data={data} actions={actions} />
    </>
  );
}
