import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, homePathForRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { LogoutButton } from '@/components/LogoutButton';
import { deliverOutboxEvents } from '@/modules/history/history';

const NAV: Record<string, { href: string; label: string }[]> = {
  CUSTOMER: [
    { href: '/customer', label: 'Dashboard' },
    { href: '/customer/orders', label: 'Orders' },
    { href: '/customer/requests', label: 'My returns' },
  ],
  OPERATOR: [
    { href: '/operator', label: 'Review queue' },
    { href: '/operator/appeals', label: 'Appeals' },
  ],
  WAREHOUSE: [{ href: '/warehouse', label: 'Inspection queue' }],
  FINANCE: [{ href: '/finance', label: 'Refund queue' }],
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  await deliverOutboxEvents();
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  const items = NAV[user.role] ?? [{ href: homePathForRole(user.role), label: 'Home' }];

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-3 px-4 py-3">
          <Link href={homePathForRole(user.role)} className="text-base font-semibold">
            RMA Portal
          </Link>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-600">
            {user.role.toLowerCase()}
          </span>
          <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto sm:flex-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/notifications" className="btn-secondary relative">
              Alerts
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-xs text-white">
                  {unread}
                </span>
              ) : null}
            </Link>
            <span className="muted hidden sm:inline">{user.displayName}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-content px-4 py-5">{children}</main>
    </div>
  );
}
