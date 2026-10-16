import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { StatusPill, formatDate, money } from '@/components/ui';
import { ReturnForm } from '@/components/ReturnForm';
import { returnableItems } from '@/modules/returns/service';
import { STANDARD_RETURN_DAYS, toMinor } from '@/modules/returns/domain';

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export default async function CustomerOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await requireRole('CUSTOMER');
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId: user.id },
    include: {
      items: true,
      returnRequests: { include: { items: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) notFound();

  const returnable = await returnableItems(order.id, user);
  const delivered = order.deliveredAt;

  const lines = returnable.map((item) => ({
    orderItemId: item.orderItemId,
    productName: item.productName,
    availableQuantity: item.availableQuantity,
    unitPrice: money(item.unitPriceMinor),
    standardWindowEnds: delivered ? formatDate(addDays(delivered, STANDARD_RETURN_DAYS)) : 'not delivered',
    defectiveWindowEnds: delivered ? formatDate(addMonths(delivered, item.warrantyMonths)) : 'not delivered',
  }));

  const orderTotalMinor = order.items.reduce((sum, i) => sum + i.quantity * toMinor(i.unitPrice), 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Order {order.orderNumber}</h1>
          <p className="muted">
            Placed {formatDate(order.placedAt)} · delivered {formatDate(order.deliveredAt)} ·{' '}
            {money(orderTotalMinor, order.currency)} paid with {order.paymentMethod}
          </p>
        </div>
        <StatusPill status={order.status} />
      </header>

      {order.returnRequests.length > 0 ? (
        <section className="card space-y-2">
          <h2 className="font-medium">Return requests on this order</h2>
          <ul className="space-y-1 text-sm">
            {order.returnRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/customer/requests/${r.id}`} className="text-indigo-700 hover:underline">
                  {r.reference}
                </Link>
                <StatusPill status={r.status} />
                <span className="muted">
                  {r.items.length} line(s) · created {formatDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-medium">Start a return</h2>
        {order.status !== 'DELIVERED' ? (
          <p className="muted">This order is not delivered yet, so nothing can be returned.</p>
        ) : lines.every((l) => l.availableQuantity === 0) ? (
          <p className="muted">Every unit of this order is already on an open return request.</p>
        ) : (
          <ReturnForm lines={lines} orderId={order.id} />
        )}
      </section>
    </div>
  );
}
