import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Pill, formatDate } from '@/components/ui';
import { PageHeader, EmptyState } from '@/components/ListControls';

export default async function OperatorAppealsPage() {
  const user = await requireRole('OPERATOR');
  const appeals = await prisma.appeal.findMany({
    where: { status: 'PENDING' },
    include: {
      returnRequest: { include: { customer: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Appeals"
        subtitle="An appeal can only be decided by an operator other than the one who rejected the request."
      />

      {appeals.length === 0 ? (
        <div className="panel">
          <EmptyState>No open appeals.</EmptyState>
        </div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Customer</th>
                <th className="hidden sm:table-cell">Appealed</th>
                <th>Customer's comment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {appeals.map((a) => {
                const blocked = a.returnRequest.reviewedById === user.id;
                return (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/operator/${a.returnRequestId}`} className="font-medium text-indigo-700 hover:underline">
                        {a.returnRequest.reference}
                      </Link>
                      <div className="mt-0.5">
                        <Pill tone={blocked ? 'red' : 'green'}>{blocked ? 'you rejected this' : 'open to you'}</Pill>
                      </div>
                    </td>
                    <td>{a.returnRequest.customer.displayName}</td>
                    <td className="muted hidden sm:table-cell">{formatDate(a.createdAt)}</td>
                    <td className="max-w-md">{a.comment}</td>
                    <td className="text-right">
                      <Link href={`/operator/${a.returnRequestId}`} className="btn-secondary px-3 py-1.5 text-sm">
                        Review
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
