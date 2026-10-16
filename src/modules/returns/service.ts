import type { RequestStatus, ReturnReason, UserRole } from '@prisma/client';
import { Forbidden, NotFound, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import type { CurrentUser } from '@/lib/auth/session';
import { recordHistory } from '@/modules/history/history';
import { applyStep, assertStep } from '@/modules/statemachine/engine';
import {
  ACTIVE_REQUEST_STATUSES,
  checkEligibility,
  shippingPayerFor,
  RETURN_SHIPPING_COSTMinor,
  toMinor,
} from '@/modules/returns/domain';

const BLOCKING_STATUSES: RequestStatus[] = ACTIVE_REQUEST_STATUSES.filter((s) => s !== 'DRAFT');

export type ReturnableItem = {
  orderItemId: string;
  productName: string;
  unitPriceMinor: number;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  warrantyMonths: number;
};

export async function loadOrderForCustomer(orderId: string, user: CurrentUser) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      returnRequests: { include: { items: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) throw new NotFound('Order not found');
  if (user.role === 'CUSTOMER' && order.customerId !== user.id) {
    throw new Forbidden('This order belongs to another customer');
  }
  return order;
}

/** Units that can still be returned: ordered minus units reserved by submitted requests. */
export async function returnableItems(orderId: string, user: CurrentUser): Promise<ReturnableItem[]> {
  const order = await loadOrderForCustomer(orderId, user);

  const reserved = await prisma.returnItem.groupBy({
    by: ['orderItemId'],
    where: {
      orderItem: { orderId },
      returnRequest: { status: { in: BLOCKING_STATUSES } },
    },
    _sum: { requestedQuantity: true },
  });
  const reservedMap = new Map(reserved.map((r) => [r.orderItemId, r._sum.requestedQuantity ?? 0]));

  return order.items.map((item) => {
    const reservedQuantity = reservedMap.get(item.id) ?? 0;
    const quantity = item.quantity;
    return {
      orderItemId: item.id,
      productName: item.productName,
      unitPriceMinor: toMinor(item.unitPrice),
      quantity,
      reservedQuantity,
      availableQuantity: Math.max(0, quantity - reservedQuantity),
      warrantyMonths: item.warrantyMonths,
    };
  });
}

type DraftItemInput = { orderItemId: string; quantity: number; reason: ReturnReason };

export async function createDraft(
  user: CurrentUser,
  input: { orderId: string; items: DraftItemInput[]; notes?: string | null },
): Promise<{ id: string; reference: string }> {
  const order = await loadOrderForCustomer(input.orderId, user);
  if (order.status !== 'DELIVERED') throw new ValidationError('Only delivered orders can be returned');

  const names = await productNameMap(order.id);
  const request = await prisma.returnRequest.create({
    data: {
      customerId: user.id,
      orderId: order.id,
      reference: await nextReference(),
      status: 'DRAFT',
      overallReason: input.items[0].reason,
      shippingPaidBy: 'STORE',
      returnShippingCost: RETURN_SHIPPING_COSTMinor / 100,
      notes: input.notes ?? null,
      items: {
        create: input.items.map((i) => ({
          orderItemId: i.orderItemId,
          productName: names.get(i.orderItemId) ?? '',
          requestedQuantity: i.quantity,
          reason: i.reason,
        })),
      },
    },
  });

  await prisma.$transaction(async (tx) => {
    await recordHistory(tx, {
      returnRequestId: request.id,
      actorId: user.id,
      actorLabel: user.displayName,
      action: 'draft_created',
      toStatus: 'DRAFT',
      detail: { items: input.items.length },
    });
  });

  return { id: request.id, reference: request.reference };
}

export async function replaceDraftItems(
  user: CurrentUser,
  requestId: string,
  items: DraftItemInput[],
  notes?: string | null,
): Promise<void> {
  const request = await loadRequestForActor(requestId, user, ['CUSTOMER']);
  assertStep({ step: 'draft_edit', request, actor: user });
  if (items.length === 0) throw new ValidationError('Select at least one item to return');
  const names = await productNameMap(request.orderId);

  await prisma.$transaction(async (tx) => {
    await tx.returnItem.deleteMany({ where: { returnRequestId: requestId } });
    await tx.returnItem.createMany({
      data: items.map((i) => ({
        returnRequestId: requestId,
        orderItemId: i.orderItemId,
        productName: names.get(i.orderItemId) ?? '',
        requestedQuantity: i.quantity,
        reason: i.reason,
      })),
    });
    await applyStep(tx, {
      step: 'draft_edit',
      request,
      actor: user,
      set: { notes: notes ?? null, overallReason: items[0].reason },
      detail: { items: items.length },
    });
  });
}

export async function submitRequest(user: CurrentUser, requestId: string): Promise<void> {
  const request = await loadRequestForActor(requestId, user, ['CUSTOMER']);
  assertStep({ step: 'submit', request, actor: user });
  if (request.items.length === 0) throw new ValidationError('Add at least one item before submitting');

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: request.orderId },
    include: { items: true },
  });
  const now = new Date();

  for (const item of request.items) {
    const orderItem = order.items.find((oi) => oi.id === item.orderItemId);
    if (!orderItem) throw new ValidationError('A selected item no longer belongs to this order');

    const otherReserved = await prisma.returnItem.aggregate({
      _sum: { requestedQuantity: true },
      where: {
        orderItemId: item.orderItemId,
        returnRequest: { status: { in: BLOCKING_STATUSES }, NOT: { id: requestId } },
      },
    });
    const available = Math.max(0, orderItem.quantity - (otherReserved._sum.requestedQuantity ?? 0));

    const eligibility = checkEligibility({
      deliveredAt: order.deliveredAt,
      warrantyMonths: orderItem.warrantyMonths,
      now,
      reason: item.reason,
      requestedQuantity: item.requestedQuantity,
      availableQuantity: available,
    });
    if (!eligibility.ok) throw new ValidationError(eligibility.errors.join(' | '));
  }

  const payer = shippingPayerFor(request.items.map((i) => i.reason));

  await prisma.$transaction(async (tx) => {
    for (const item of request.items) {
      const orderItem = order.items.find((oi) => oi.id === item.orderItemId)!;
      await tx.returnItem.update({
        where: { id: item.id },
        data: { productName: orderItem.productName },
      });
    }

    await applyStep(tx, {
      step: 'submit',
      request,
      actor: user,
      set: { submittedAt: now, overallReason: request.items[0].reason, shippingPaidBy: payer },
      reason: `Return shipping paid by ${payer.toLowerCase()}`,
      detail: { items: request.items.length, shippingPaidBy: payer },
    });
  });
}

export async function cancelRequest(user: CurrentUser, requestId: string, reason: string): Promise<void> {
  const request = await loadRequestForActor(requestId, user, ['CUSTOMER']);
  assertStep({ step: 'cancel', request, actor: user });

  await prisma.$transaction(async (tx) => {
    await applyStep(tx, { step: 'cancel', request, actor: user, reason });
  });
}

export async function loadRequestForActor(
  requestId: string,
  user: CurrentUser,
  allowedRoles: UserRole[],
) {
  const request = await prisma.returnRequest.findUnique({
    where: { id: requestId },
    include: {
      order: { include: { items: true } },
      customer: true,
      items: { include: { orderItem: true } },
      appeals: { include: { reviewedBy: true } },
      reviewedBy: true,
      refunds: { include: { attempts: { orderBy: { attemptNumber: 'asc' } } } },
      history: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!request) throw new NotFound('Return request not found');
  if (user.role === 'CUSTOMER') {
    if (request.customerId !== user.id) throw new Forbidden('This request belongs to another customer');
  } else if (!allowedRoles.includes(user.role)) {
    throw new Forbidden(`Only ${allowedRoles.join(' or ')} users can open this request`);
  }
  return request;
}

async function productNameMap(orderId: string): Promise<Map<string, string>> {
  const items = await prisma.orderItem.findMany({ where: { orderId }, select: { id: true, productName: true } });
  return new Map(items.map((i) => [i.id, i.productName]));
}

async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.floor(1000 + Math.random() * 8999) * 100 + (await prisma.returnRequest.count());
    const reference = `RMA-${year}-${String(suffix % 1_000_000).padStart(6, '0')}`;
    const clash = await prisma.returnRequest.findUnique({ where: { reference }, select: { id: true } });
    if (!clash) return reference;
  }
  return `RMA-${year}-${Date.now().toString().slice(-6)}`;
}
