/**
 * Demo scenario table for scripts/gen-demo.ts. Every date is relative to "now" so the return
 * windows stay correct whenever the reviewer boots the containers.
 *
 * Users: 2 customers, 2 operators, 1 warehouse inspector, 1 finance user.
 * Orders: delivered yesterday, 3, 6, 7, 8, 10, 12, 15, 18, 20, 25, 29 days ago, about a year ago,
 * plus one order still in transit. A batch of extra orders per customer (mostly without any
 * return request) keeps the customer lists long enough to demonstrate search and pagination.
 * Requests: one per implemented state (see README for the mapping), plus a few extra so the
 * customer's request list paginates as well.
 */

export const SHIPPING = 4.99;

export type Age = { days: number; months?: number };

type Item = { id: string; sku: string; name: string; qty: number; price: number; warrantyMonths: number };

export type Order = {
  id: string;
  number: string;
  customer: string;
  status?: string;
  placed: Age;
  delivered: Age | null;
  paymentMethod: string;
  currency: string;
  paymentRef: string;
  items: Item[];
};

export type ReqItem = {
  id: string;
  orderItem: string;
  requested: number;
  reason: string;
  decision: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved?: number;
  rejectReason?: string;
  receipt?: 'NOT_APPLICABLE' | 'AWAITING' | 'RECEIVED' | 'NOT_RECEIVED';
  inspection?: 'PENDING' | 'AS_DECLARED' | 'WORSE_THAN_DECLARED' | 'NOT_RECEIVED';
  percentage?: number;
  inspectionComment?: string;
};

export type Req = {
  id: string;
  reference: string;
  order: string;
  customer: string;
  status: string;
  overallReason: string;
  payer: 'CUSTOMER' | 'STORE';
  notes?: string;
  created: Age;
  submitted?: Age;
  reviewer?: string;
  reviewed?: Age;
  items: ReqItem[];
  appeal?: {
    id: string;
    comment: string;
    status: string;
    created: Age;
    reviewer?: string;
    reviewReason?: string;
    reviewed?: Age;
  };
  refund?: {
    id: string;
    status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'UNCERTAIN';
    attempts: Array<{ outcome: string; code: string; message: string; latency: number; at: Age; providerRef?: string }>;
    providerRef?: string;
    failureReason?: string;
    at: Age;
  };
  history: Array<{
    at: Age;
    actor: string | null;
    actorLabel: string;
    action: string;
    from: string | null;
    to: string;
    reason?: string;
    detail?: unknown;
  }>;
};

export const users = [
  { id: 'u-ana', username: 'customer.ana', displayName: 'Ana Torres', role: 'CUSTOMER' },
  { id: 'u-bob', username: 'customer.bob', displayName: 'Bob Jensen', role: 'CUSTOMER' },
  { id: 'u-sam', username: 'operator.sam', displayName: 'Sam Patel', role: 'OPERATOR' },
  { id: 'u-zoe', username: 'operator.zoe', displayName: 'Zoe Kim', role: 'OPERATOR' },
  { id: 'u-lee', username: 'warehouse.lee', displayName: 'Lee Novak', role: 'WAREHOUSE' },
  { id: 'u-max', username: 'finance.max', displayName: 'Max Ivers', role: 'FINANCE' },
];

export const orders: Order[] = [
  {
    id: 'o-1001',
    number: 'ORD-1001',
    customer: 'u-ana',
    placed: { days: 4 },
    delivered: { days: 3 },
    paymentMethod: 'card_visa',
    currency: 'EUR',
    paymentRef: 'PAY-1001',
    items: [
      { id: 'oi-1001a', sku: 'SKU-HEAD', name: 'Wireless Headphones', qty: 2, price: 89.99, warrantyMonths: 24 },
      { id: 'oi-1001b', sku: 'SKU-CABLE', name: 'USB-C Cable 2m', qty: 3, price: 9.5, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1002',
    number: 'ORD-1002',
    customer: 'u-ana',
    placed: { days: 8 },
    delivered: { days: 7 },
    paymentMethod: 'paypal',
    currency: 'EUR',
    paymentRef: 'PAY-1002',
    items: [
      { id: 'oi-1002a', sku: 'SKU-MUG', name: 'Ceramic Mug 350ml', qty: 4, price: 12.0, warrantyMonths: 12 },
      { id: 'oi-1002b', sku: 'SKU-LAMP', name: 'Desk Lamp', qty: 1, price: 45.0, warrantyMonths: 24 },
    ],
  },
  {
    id: 'o-1003',
    number: 'ORD-1003',
    customer: 'u-bob',
    placed: { days: 22 },
    delivered: { days: 20 },
    paymentMethod: 'card_mastercard',
    currency: 'EUR',
    paymentRef: 'PAY-1003',
    items: [
      { id: 'oi-1003a', sku: 'SKU-SHOES', name: 'Running Shoes 43', qty: 1, price: 119.0, warrantyMonths: 24 },
      { id: 'oi-1003b', sku: 'SKU-SOCKS', name: 'Sport Socks 3-pack', qty: 2, price: 14.5, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1004',
    number: 'ORD-1004',
    customer: 'u-bob',
    placed: { days: 8 },
    delivered: { days: 6 },
    paymentMethod: 'klarna_invoice',
    currency: 'EUR',
    paymentRef: 'PAY-1004',
    items: [
      { id: 'oi-1004a', sku: 'SKU-MONITOR', name: '24 inch Monitor', qty: 1, price: 149.0, warrantyMonths: 24 },
      { id: 'oi-1004b', sku: 'SKU-HDMI', name: 'HDMI Cable', qty: 2, price: 7.99, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1005',
    number: 'ORD-1005',
    customer: 'u-ana',
    placed: { days: 11 },
    delivered: { days: 10 },
    paymentMethod: 'card_visa',
    currency: 'EUR',
    paymentRef: 'PAY-1005',
    items: [
      { id: 'oi-1005a', sku: 'SKU-PAN', name: 'Non-stick Pan 26cm', qty: 1, price: 39.99, warrantyMonths: 24 },
      { id: 'oi-1005b', sku: 'SKU-SPATULA', name: 'Silicone Spatula', qty: 2, price: 6.5, warrantyMonths: 12 },
    ],
  },
  {
    // The one-year-old order: only the defective path is still open, and just one of two drills
    // has been returned, so this order stays partially returned.
    id: 'o-1006',
    number: 'ORD-1006',
    customer: 'u-bob',
    placed: { days: 5, months: 12 },
    delivered: { days: 2, months: 12 },
    paymentMethod: 'paypal',
    currency: 'EUR',
    paymentRef: 'PAY-1006',
    items: [
      { id: 'oi-1006a', sku: 'SKU-DRILL', name: 'Cordless Drill 18V', qty: 2, price: 79.0, warrantyMonths: 24 },
      { id: 'oi-1006b', sku: 'SKU-BITS', name: 'Drill Bit Set', qty: 1, price: 24.0, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1007',
    number: 'ORD-1007',
    customer: 'u-ana',
    placed: { days: 19 },
    delivered: { days: 18 },
    paymentMethod: 'card_mastercard',
    currency: 'EUR',
    paymentRef: 'PAY-1007',
    items: [
      { id: 'oi-1007a', sku: 'SKU-CHAIR', name: 'Office Chair', qty: 1, price: 199.0, warrantyMonths: 24 },
      { id: 'oi-1007b', sku: 'SKU-MAT', name: 'Floor Mat', qty: 1, price: 29.0, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1008',
    number: 'ORD-1008',
    customer: 'u-bob',
    placed: { days: 10 },
    delivered: { days: 8 },
    paymentMethod: 'apple_pay',
    currency: 'EUR',
    paymentRef: 'PAY-1008',
    items: [
      { id: 'oi-1008a', sku: 'SKU-EAR', name: 'Earbuds Pro', qty: 2, price: 59.0, warrantyMonths: 24 },
      { id: 'oi-1008b', sku: 'SKU-CASE', name: 'Earbud Case', qty: 1, price: 15.0, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1009',
    number: 'ORD-1009',
    customer: 'u-ana',
    placed: { days: 21 },
    delivered: { days: 20 },
    paymentMethod: 'paypal',
    currency: 'EUR',
    paymentRef: 'PAY-1009',
    items: [
      { id: 'oi-1009a', sku: 'SKU-BLEND', name: 'Hand Blender', qty: 1, price: 49.0, warrantyMonths: 24 },
      { id: 'oi-1009b', sku: 'SKU-WHISK', name: 'Whisk Attachment', qty: 1, price: 11.0, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1010',
    number: 'ORD-1010',
    customer: 'u-bob',
    placed: { days: 31 },
    delivered: { days: 29 },
    paymentMethod: 'card_visa',
    currency: 'EUR',
    paymentRef: 'PAY-1010',
    items: [
      { id: 'oi-1010a', sku: 'SKU-JACKET', name: 'Rain Jacket M', qty: 1, price: 89.0, warrantyMonths: 24 },
      { id: 'oi-1010b', sku: 'SKU-CAP', name: 'Rain Cap', qty: 2, price: 12.0, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1011',
    number: 'ORD-1011',
    customer: 'u-bob',
    placed: { days: 17 },
    delivered: { days: 15 },
    paymentMethod: 'klarna_invoice',
    currency: 'EUR',
    paymentRef: 'PAY-1011',
    items: [
      { id: 'oi-1011a', sku: 'SKU-SPEAKER', name: 'Bluetooth Speaker', qty: 1, price: 59.0, warrantyMonths: 24 },
      { id: 'oi-1011b', sku: 'SKU-STAND', name: 'Phone Stand', qty: 2, price: 18.0, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1012',
    number: 'ORD-1012',
    customer: 'u-ana',
    placed: { days: 26 },
    delivered: { days: 25 },
    paymentMethod: 'card_visa',
    currency: 'EUR',
    paymentRef: 'PAY-1012',
    items: [
      { id: 'oi-1012a', sku: 'SKU-MOUSE', name: 'Gaming Mouse', qty: 2, price: 39.99, warrantyMonths: 24 },
      { id: 'oi-1012b', sku: 'SKU-MOUSEPAD', name: 'XL Mouse Pad', qty: 1, price: 19.0, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1013',
    number: 'ORD-1013',
    customer: 'u-bob',
    placed: { days: 31 },
    delivered: { days: 29 },
    paymentMethod: 'apple_pay',
    currency: 'EUR',
    paymentRef: 'PAY-1013',
    items: [
      { id: 'oi-1013a', sku: 'SKU-BOOTS', name: 'Rain Boots 43', qty: 1, price: 65.0, warrantyMonths: 24 },
      { id: 'oi-1013b', sku: 'SKU-INSOLE', name: 'Warm Insoles', qty: 2, price: 19.0, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1014',
    number: 'ORD-1014',
    customer: 'u-ana',
    placed: { days: 13 },
    delivered: { days: 12 },
    paymentMethod: 'paypal',
    currency: 'EUR',
    paymentRef: 'PAY-1014',
    items: [
      { id: 'oi-1014a', sku: 'SKU-BOTTLE', name: 'Insulated Water Bottle', qty: 3, price: 15.0, warrantyMonths: 24 },
      { id: 'oi-1014b', sku: 'SKU-FILTER', name: 'Filter Cartridge', qty: 2, price: 8.5, warrantyMonths: 12 },
    ],
  },
  {
    // Delivered yesterday: the freshest order, with nothing returned yet.
    id: 'o-1015',
    number: 'ORD-1015',
    customer: 'u-ana',
    placed: { days: 2 },
    delivered: { days: 1 },
    paymentMethod: 'klarna_invoice',
    currency: 'EUR',
    paymentRef: 'PAY-1015',
    items: [
      { id: 'oi-1015a', sku: 'SKU-SPEAKER', name: 'Bluetooth Speaker', qty: 2, price: 59.0, warrantyMonths: 24 },
      { id: 'oi-1015b', sku: 'SKU-TRIPPOD', name: 'Mini Tripod', qty: 1, price: 19.9, warrantyMonths: 12 },
    ],
  },
  {
    // Still in transit: proves an undelivered order cannot be returned.
    id: 'o-1016',
    number: 'ORD-1016',
    customer: 'u-bob',
    status: 'SHIPPED',
    placed: { days: 2 },
    delivered: null,
    paymentMethod: 'card_mastercard',
    currency: 'EUR',
    paymentRef: 'PAY-1016',
    items: [{ id: 'oi-1016a', sku: 'SKU-MONITOR', name: '24" Monitor', qty: 1, price: 149.0, warrantyMonths: 24 }],
  },
  {
    // The orders below exist mostly so the customer's list actually paginates and the search
    // box has something to find; a few of them also carry the extra demo requests.
    id: 'o-1017',
    number: 'ORD-1017',
    customer: 'u-ana',
    placed: { days: 5 },
    delivered: { days: 4 },
    paymentMethod: 'card_visa',
    currency: 'EUR',
    paymentRef: 'PAY-1017',
    items: [
      { id: 'oi-1017a', sku: 'SKU-YOGA', name: 'Yoga Mat', qty: 1, price: 24.9, warrantyMonths: 12 },
      { id: 'oi-1017b', sku: 'SKU-BLOCK', name: 'Yoga Block Pair', qty: 2, price: 18.5, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1018',
    number: 'ORD-1018',
    customer: 'u-ana',
    placed: { days: 11 },
    delivered: { days: 9 },
    paymentMethod: 'paypal',
    currency: 'EUR',
    paymentRef: 'PAY-1018',
    items: [
      { id: 'oi-1018a', sku: 'SKU-BEANS', name: 'Espresso Beans 1kg', qty: 2, price: 18.0, warrantyMonths: 12 },
      { id: 'oi-1018b', sku: 'SKU-FROTH', name: 'Milk Frother', qty: 1, price: 32.0, warrantyMonths: 24 },
    ],
  },
  {
    id: 'o-1019',
    number: 'ORD-1019',
    customer: 'u-ana',
    placed: { days: 14 },
    delivered: { days: 12 },
    paymentMethod: 'card_mastercard',
    currency: 'EUR',
    paymentRef: 'PAY-1019',
    items: [
      { id: 'oi-1019a', sku: 'SKU-KEYB', name: 'Mechanical Keyboard', qty: 1, price: 89.0, warrantyMonths: 24 },
      { id: 'oi-1019b', sku: 'SKU-WRIST', name: 'Wrist Rest', qty: 1, price: 14.9, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1020',
    number: 'ORD-1020',
    customer: 'u-ana',
    placed: { days: 3 },
    delivered: { days: 2 },
    paymentMethod: 'klarna_invoice',
    currency: 'EUR',
    paymentRef: 'PAY-1020',
    items: [
      { id: 'oi-1020a', sku: 'SKU-SKETCH', name: 'Sketchbook A4', qty: 2, price: 9.9, warrantyMonths: 12 },
      { id: 'oi-1020b', sku: 'SKU-PENCIL', name: 'Pencil Set 12', qty: 1, price: 12.5, warrantyMonths: 12 },
    ],
  },
  {
    // 35 days old: the changed-mind window is closed, only a defect claim would still be possible.
    id: 'o-1021',
    number: 'ORD-1021',
    customer: 'u-ana',
    placed: { days: 37 },
    delivered: { days: 35 },
    paymentMethod: 'apple_pay',
    currency: 'EUR',
    paymentRef: 'PAY-1021',
    items: [
      { id: 'oi-1021a', sku: 'SKU-TOAST', name: 'Toaster 2-Slice', qty: 1, price: 49.9, warrantyMonths: 24 },
      { id: 'oi-1021b', sku: 'SKU-KETTLE', name: 'Water Kettle', qty: 1, price: 39.0, warrantyMonths: 24 },
    ],
  },
  {
    id: 'o-1022',
    number: 'ORD-1022',
    customer: 'u-ana',
    placed: { days: 8 },
    delivered: { days: 6 },
    paymentMethod: 'card_visa',
    currency: 'EUR',
    paymentRef: 'PAY-1022',
    items: [
      { id: 'oi-1022a', sku: 'SKU-FAN', name: 'Desk Fan', qty: 1, price: 29.9, warrantyMonths: 24 },
      { id: 'oi-1022b', sku: 'SKU-FILTER', name: 'Fan Filter', qty: 3, price: 7.9, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1023',
    number: 'ORD-1023',
    customer: 'u-ana',
    placed: { days: 18 },
    delivered: { days: 16 },
    paymentMethod: 'paypal',
    currency: 'EUR',
    paymentRef: 'PAY-1023',
    items: [
      { id: 'oi-1023a', sku: 'SKU-TOOLBOX', name: 'Tool Box 16in', qty: 1, price: 64.0, warrantyMonths: 24 },
      { id: 'oi-1023b', sku: 'SKU-SCREW', name: 'Screwdriver Set', qty: 1, price: 22.0, warrantyMonths: 24 },
    ],
  },
  {
    id: 'o-1024',
    number: 'ORD-1024',
    customer: 'u-bob',
    placed: { days: 7 },
    delivered: { days: 5 },
    paymentMethod: 'card_visa',
    currency: 'EUR',
    paymentRef: 'PAY-1024',
    items: [
      { id: 'oi-1024a', sku: 'SKU-HAMMOCK', name: 'Garden Hammock', qty: 1, price: 45.0, warrantyMonths: 24 },
      { id: 'oi-1024b', sku: 'SKU-STRAP', name: 'Tree Straps', qty: 2, price: 11.0, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1025',
    number: 'ORD-1025',
    customer: 'u-bob',
    placed: { days: 23 },
    delivered: { days: 21 },
    paymentMethod: 'paypal',
    currency: 'EUR',
    paymentRef: 'PAY-1025',
    items: [
      { id: 'oi-1025a', sku: 'SKU-GLOVE', name: 'BBQ Gloves', qty: 1, price: 16.0, warrantyMonths: 12 },
      { id: 'oi-1025b', sku: 'SKU-BRUSH', name: 'Grill Brush', qty: 1, price: 13.5, warrantyMonths: 12 },
    ],
  },
  {
    id: 'o-1026',
    number: 'ORD-1026',
    customer: 'u-bob',
    placed: { days: 35 },
    delivered: { days: 33 },
    paymentMethod: 'klarna_invoice',
    currency: 'EUR',
    paymentRef: 'PAY-1026',
    items: [
      { id: 'oi-1026a', sku: 'SKU-VAC', name: 'Car Vacuum', qty: 1, price: 55.0, warrantyMonths: 24 },
      { id: 'oi-1026b', sku: 'SKU-CLOTH', name: 'Microfiber Cloths 5-pack', qty: 5, price: 9.0, warrantyMonths: 12 },
    ],
  },
];

export const requests: Req[] = [
  {
    id: 'r-0001',
    reference: 'RMA-2026-0001',
    order: 'o-1001',
    customer: 'u-ana',
    status: 'DRAFT',
    overallReason: 'CHANGED_MIND',
    payer: 'STORE',
    notes: 'Saved while I decide whether to send the cable back.',
    created: { days: 1 },
    items: [{ id: 'ri-0001a', orderItem: 'oi-1001b', requested: 1, reason: 'CHANGED_MIND', decision: 'PENDING' }],
    history: [
      { at: { days: 1 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'draft_created', from: null, to: 'DRAFT', detail: { items: 1 } },
    ],
  },
  {
    id: 'r-0002',
    reference: 'RMA-2026-0002',
    order: 'o-1002',
    customer: 'u-ana',
    status: 'SUBMITTED',
    overallReason: 'NOT_AS_DESCRIBED',
    payer: 'STORE',
    notes: 'The lamp shade is a different colour from the photos, and two mugs were a duplicate order.',
    created: { days: 2 },
    submitted: { days: 2 },
    items: [
      { id: 'ri-0002a', orderItem: 'oi-1002b', requested: 1, reason: 'NOT_AS_DESCRIBED', decision: 'PENDING' },
      { id: 'ri-0002b', orderItem: 'oi-1002a', requested: 2, reason: 'CHANGED_MIND', decision: 'PENDING' },
    ],
    history: [
      { at: { days: 2 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'draft_created', from: null, to: 'DRAFT' },
      {
        at: { days: 2 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED',
        reason: 'Mixed reasons, so the store pays return shipping',
      },
    ],
  },
  {
    id: 'r-0003',
    reference: 'RMA-2026-0003',
    order: 'o-1003',
    customer: 'u-bob',
    status: 'UNDER_REVIEW',
    overallReason: 'WRONG_ITEM',
    payer: 'STORE',
    created: { days: 3 },
    submitted: { days: 3 },
    reviewer: 'u-sam',
    reviewed: { days: 1 },
    items: [
      { id: 'ri-0003a', orderItem: 'oi-1003a', requested: 1, reason: 'WRONG_ITEM', decision: 'PENDING' },
      { id: 'ri-0003b', orderItem: 'oi-1003b', requested: 2, reason: 'WRONG_ITEM', decision: 'PENDING' },
    ],
    history: [
      { at: { days: 3 }, actor: 'u-bob', actorLabel: 'Bob Jensen', action: 'draft_created', from: null, to: 'DRAFT' },
      { at: { days: 3 }, actor: 'u-bob', actorLabel: 'Bob Jensen', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 1 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'review_started', from: 'SUBMITTED', to: 'UNDER_REVIEW' },
    ],
  },
  {
    id: 'r-0004',
    reference: 'RMA-2026-0004',
    order: 'o-1004',
    customer: 'u-bob',
    status: 'APPROVED',
    overallReason: 'DEFECTIVE',
    payer: 'STORE',
    created: { days: 4 },
    submitted: { days: 4 },
    reviewer: 'u-zoe',
    reviewed: { days: 3 },
    items: [
      { id: 'ri-0004a', orderItem: 'oi-1004a', requested: 1, reason: 'DEFECTIVE', decision: 'APPROVED', approved: 1, receipt: 'AWAITING', inspection: 'PENDING' },
      { id: 'ri-0004b', orderItem: 'oi-1004b', requested: 2, reason: 'DAMAGED_IN_TRANSIT', decision: 'APPROVED', approved: 2, receipt: 'AWAITING', inspection: 'PENDING' },
    ],
    history: [
      { at: { days: 4 }, actor: 'u-bob', actorLabel: 'Bob Jensen', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 3 }, actor: 'u-zoe', actorLabel: 'Zoe Kim', action: 'review_started', from: 'SUBMITTED', to: 'UNDER_REVIEW' },
      {
        at: { days: 3 }, actor: 'u-zoe', actorLabel: 'Zoe Kim', action: 'decisions_recorded', from: 'UNDER_REVIEW', to: 'APPROVED',
        detail: [
          { item: '24 inch Monitor', decision: 'APPROVED', approvedQuantity: 1 },
          { item: 'HDMI Cable', decision: 'APPROVED', approvedQuantity: 2 },
        ],
      },
    ],
  },
  {
    id: 'r-0005',
    reference: 'RMA-2026-0005',
    order: 'o-1005',
    customer: 'u-ana',
    status: 'PARTIALLY_APPROVED',
    overallReason: 'CHANGED_MIND',
    payer: 'CUSTOMER',
    created: { days: 5 },
    submitted: { days: 5 },
    reviewer: 'u-sam',
    reviewed: { days: 4 },
    items: [
      { id: 'ri-0005a', orderItem: 'oi-1005a', requested: 1, reason: 'CHANGED_MIND', decision: 'APPROVED', approved: 1, receipt: 'AWAITING', inspection: 'PENDING' },
      {
        id: 'ri-0005b', orderItem: 'oi-1005b', requested: 2, reason: 'CHANGED_MIND', decision: 'REJECTED',
        rejectReason: 'The spatulas were opened and cannot be resold. Change-of-mind returns must be unused.',
      },
    ],
    history: [
      { at: { days: 5 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED', reason: 'Changed mind, so the customer pays return shipping' },
      { at: { days: 4 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'review_started', from: 'SUBMITTED', to: 'UNDER_REVIEW' },
      {
        at: { days: 4 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'decisions_recorded', from: 'UNDER_REVIEW', to: 'PARTIALLY_APPROVED',
        reason: 'Spatulas were opened',
        detail: [
          { item: 'Non-stick Pan 26cm', decision: 'APPROVED', approvedQuantity: 1 },
          { item: 'Silicone Spatula', decision: 'REJECTED' },
        ],
      },
    ],
  },
  {
    id: 'r-0006',
    reference: 'RMA-2026-0006',
    order: 'o-1013',
    customer: 'u-bob',
    status: 'FULLY_REJECTED',
    overallReason: 'CHANGED_MIND',
    payer: 'CUSTOMER',
    created: { days: 2 },
    submitted: { days: 2 },
    reviewer: 'u-sam',
    reviewed: { days: 1 },
    items: [
      {
        id: 'ri-0006a', orderItem: 'oi-1013a', requested: 1, reason: 'CHANGED_MIND', decision: 'REJECTED',
        rejectReason: '29 days since delivery: changed-mind returns must be requested within 14 days.',
      },
      {
        id: 'ri-0006b', orderItem: 'oi-1013b', requested: 2, reason: 'CHANGED_MIND', decision: 'REJECTED',
        rejectReason: '29 days since delivery: changed-mind returns must be requested within 14 days.',
      },
    ],
    history: [
      { at: { days: 2 }, actor: 'u-bob', actorLabel: 'Bob Jensen', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 1 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'review_started', from: 'SUBMITTED', to: 'UNDER_REVIEW' },
      {
        at: { days: 1 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'fully_rejected', from: 'UNDER_REVIEW', to: 'FULLY_REJECTED',
        reason: 'Outside the 14 day change-of-mind window',
      },
    ],
  },
  {
    id: 'r-0007',
    reference: 'RMA-2026-0007',
    order: 'o-1009',
    customer: 'u-ana',
    status: 'APPEALED',
    overallReason: 'CHANGED_MIND',
    payer: 'CUSTOMER',
    created: { days: 6 },
    submitted: { days: 6 },
    reviewer: 'u-sam',
    reviewed: { days: 5 },
    items: [
      {
        id: 'ri-0007a', orderItem: 'oi-1009a', requested: 1, reason: 'CHANGED_MIND', decision: 'REJECTED',
        rejectReason: '20 days since delivery, outside the 14 day change-of-mind window.',
      },
    ],
    appeal: {
      id: 'ap-0007',
      comment: 'The blender was faulty on arrival, so I stopped using it and reported late. Please reconsider it as defective.',
      status: 'PENDING',
      created: { days: 3 },
    },
    history: [
      { at: { days: 6 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 5 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'review_started', from: 'SUBMITTED', to: 'UNDER_REVIEW' },
      { at: { days: 5 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'fully_rejected', from: 'UNDER_REVIEW', to: 'FULLY_REJECTED', reason: 'Outside the 14 day window' },
      { at: { days: 3 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'appeal_submitted', from: 'FULLY_REJECTED', to: 'APPEALED', reason: 'Faulty on arrival, reported late' },
    ],
  },
  {
    id: 'r-0008',
    reference: 'RMA-2026-0008',
    order: 'o-1007',
    customer: 'u-ana',
    status: 'CLOSED',
    overallReason: 'CHANGED_MIND',
    payer: 'CUSTOMER',
    created: { days: 8 },
    submitted: { days: 8 },
    reviewer: 'u-sam',
    reviewed: { days: 7 },
    items: [
      {
        id: 'ri-0008a', orderItem: 'oi-1007a', requested: 1, reason: 'CHANGED_MIND', decision: 'REJECTED',
        rejectReason: '18 days since delivery and the chair shows wear: outside the change-of-mind window.',
      },
      {
        id: 'ri-0008b', orderItem: 'oi-1007b', requested: 1, reason: 'CHANGED_MIND', decision: 'REJECTED',
        rejectReason: '18 days since delivery: outside the change-of-mind window.',
      },
    ],
    appeal: {
      id: 'ap-0008',
      comment: 'I only decided last week, I did not realise the window was 14 days.',
      status: 'UPHELD',
      created: { days: 6 },
      reviewer: 'u-zoe',
      reviewReason: 'The window is store policy and the chair is used. Rejection stands.',
      reviewed: { days: 5 },
    },
    history: [
      { at: { days: 8 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 7 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'review_started', from: 'SUBMITTED', to: 'UNDER_REVIEW' },
      { at: { days: 7 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'fully_rejected', from: 'UNDER_REVIEW', to: 'FULLY_REJECTED', reason: 'Outside the 14 day window' },
      { at: { days: 6 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'appeal_submitted', from: 'FULLY_REJECTED', to: 'APPEALED' },
      { at: { days: 5 }, actor: 'u-zoe', actorLabel: 'Zoe Kim', action: 'appeal_upheld', from: 'APPEALED', to: 'APPEAL_REJECTED', reason: 'Rejection stands' },
      { at: { days: 5 }, actor: null, actorLabel: 'system', action: 'closed', from: 'APPEAL_REJECTED', to: 'CLOSED' },
    ],
  },
  {
    id: 'r-0009',
    reference: 'RMA-2026-0009',
    order: 'o-1008',
    customer: 'u-bob',
    status: 'RECEIVED',
    overallReason: 'DAMAGED_IN_TRANSIT',
    payer: 'STORE',
    created: { days: 6 },
    submitted: { days: 6 },
    reviewer: 'u-sam',
    reviewed: { days: 5 },
    items: [
      { id: 'ri-0009a', orderItem: 'oi-1008a', requested: 2, reason: 'DAMAGED_IN_TRANSIT', decision: 'APPROVED', approved: 2, receipt: 'RECEIVED', inspection: 'PENDING' },
      { id: 'ri-0009b', orderItem: 'oi-1008b', requested: 1, reason: 'DAMAGED_IN_TRANSIT', decision: 'APPROVED', approved: 1, receipt: 'RECEIVED', inspection: 'PENDING' },
    ],
    history: [
      { at: { days: 6 }, actor: 'u-bob', actorLabel: 'Bob Jensen', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 5 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'decisions_recorded', from: 'UNDER_REVIEW', to: 'APPROVED' },
      {
        at: { days: 2 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'goods_received', from: 'APPROVED', to: 'RECEIVED',
        detail: [
          { item: 'Earbuds Pro', received: true },
          { item: 'Earbud Case', received: true },
        ],
      },
    ],
  },
  {
    id: 'r-0010',
    reference: 'RMA-2026-0010',
    order: 'o-1011',
    customer: 'u-bob',
    status: 'INSPECTING',
    overallReason: 'DEFECTIVE',
    payer: 'STORE',
    created: { days: 10 },
    submitted: { days: 10 },
    reviewer: 'u-zoe',
    reviewed: { days: 9 },
    items: [
      {
        id: 'ri-0010a', orderItem: 'oi-1011a', requested: 1, reason: 'DEFECTIVE', decision: 'APPROVED', approved: 1,
        receipt: 'RECEIVED', inspection: 'WORSE_THAN_DECLARED', percentage: 60,
        inspectionComment: 'Casing cracked and battery dies in 20 minutes, worse than the customer described.',
      },
      { id: 'ri-0010b', orderItem: 'oi-1011b', requested: 2, reason: 'DAMAGED_IN_TRANSIT', decision: 'APPROVED', approved: 2, receipt: 'RECEIVED', inspection: 'PENDING' },
    ],
    history: [
      { at: { days: 10 }, actor: 'u-bob', actorLabel: 'Bob Jensen', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 9 }, actor: 'u-zoe', actorLabel: 'Zoe Kim', action: 'decisions_recorded', from: 'UNDER_REVIEW', to: 'APPROVED' },
      { at: { days: 6 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'goods_received', from: 'APPROVED', to: 'RECEIVED' },
      {
        at: { days: 5 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'inspection_recorded', from: 'RECEIVED', to: 'INSPECTING',
        detail: [{ item: 'Bluetooth Speaker', result: 'WORSE_THAN_DECLARED', percentage: 60, refundMinor: 3540 }],
      },
    ],
  },
  {
    id: 'r-0011',
    reference: 'RMA-2026-0011',
    order: 'o-1014',
    customer: 'u-ana',
    status: 'REFUND_PENDING',
    overallReason: 'WRONG_ITEM',
    payer: 'STORE',
    created: { days: 9 },
    submitted: { days: 9 },
    reviewer: 'u-sam',
    reviewed: { days: 8 },
    items: [
      {
        id: 'ri-0011a', orderItem: 'oi-1014a', requested: 3, reason: 'WRONG_ITEM', decision: 'APPROVED', approved: 3,
        receipt: 'RECEIVED', inspection: 'AS_DECLARED', inspectionComment: 'Unopened, wrong colour shipped by the warehouse.',
      },
    ],
    refund: { id: 'rf-0011', status: 'PENDING', at: { days: 3 }, attempts: [] },
    history: [
      { at: { days: 9 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 8 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'decisions_recorded', from: 'UNDER_REVIEW', to: 'APPROVED' },
      { at: { days: 4 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'goods_received', from: 'APPROVED', to: 'RECEIVED' },
      { at: { days: 3 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'inspection_recorded', from: 'RECEIVED', to: 'INSPECTION_COMPLETE' },
      {
        at: { days: 3 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'refund_queued', from: 'INSPECTION_COMPLETE', to: 'REFUND_PENDING',
        detail: { amountMinor: 4500, idempotencyKey: 'RFN-RMA-2026-0011' },
      },
    ],
  },
  {
    id: 'r-0012',
    reference: 'RMA-2026-0012',
    order: 'o-1012',
    customer: 'u-ana',
    status: 'REFUND_PROCESSING',
    overallReason: 'DEFECTIVE',
    payer: 'STORE',
    created: { days: 20 },
    submitted: { days: 20 },
    reviewer: 'u-zoe',
    reviewed: { days: 19 },
    items: [
      {
        id: 'ri-0012a', orderItem: 'oi-1012a', requested: 2, reason: 'DEFECTIVE', decision: 'APPROVED', approved: 2,
        receipt: 'RECEIVED', inspection: 'AS_DECLARED', inspectionComment: 'Both mice double-click; warranty claim accepted.',
      },
    ],
    refund: {
      id: 'rf-0012',
      status: 'UNCERTAIN',
      at: { days: 14 },
      failureReason: 'GATEWAY_TIMEOUT: The provider did not answer. The payout may or may not have happened.',
      attempts: [
        {
          outcome: 'UNKNOWN', code: 'GATEWAY_TIMEOUT',
          message: 'The provider did not answer. The payout may or may not have happened.', latency: 3010, at: { days: 12 },
        },
      ],
    },
    history: [
      { at: { days: 20 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 19 }, actor: 'u-zoe', actorLabel: 'Zoe Kim', action: 'decisions_recorded', from: 'UNDER_REVIEW', to: 'APPROVED' },
      { at: { days: 15 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'inspection_recorded', from: 'RECEIVED', to: 'INSPECTION_COMPLETE' },
      {
        at: { days: 14 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'refund_queued', from: 'INSPECTION_COMPLETE', to: 'REFUND_PENDING',
        detail: { amountMinor: 7998, idempotencyKey: 'RFN-RMA-2026-0012' },
      },
      {
        at: { days: 12 }, actor: 'u-max', actorLabel: 'Max Ivers', action: 'refund_uncertain', from: 'REFUND_PROCESSING', to: 'REFUND_PROCESSING',
        reason: 'GATEWAY_TIMEOUT: no provider answer. Any retry must reuse the same idempotency key.',
        detail: { attemptNumber: 1 },
      },
    ],
  },
  {
    id: 'r-0013',
    reference: 'RMA-2026-0013',
    order: 'o-1006',
    customer: 'u-bob',
    status: 'CLOSED',
    overallReason: 'DEFECTIVE',
    payer: 'STORE',
    created: { days: 30 },
    submitted: { days: 30 },
    reviewer: 'u-sam',
    reviewed: { days: 29 },
    items: [
      {
        id: 'ri-0013a', orderItem: 'oi-1006a', requested: 1, reason: 'DEFECTIVE', decision: 'APPROVED', approved: 1,
        receipt: 'RECEIVED', inspection: 'AS_DECLARED', inspectionComment: 'Battery will not hold a charge; still inside the 24 month warranty.',
      },
    ],
    refund: {
      id: 'rf-0013',
      status: 'SUCCEEDED',
      at: { days: 25 },
      providerRef: 'PAY-MA-2026-0013',
      attempts: [
        { outcome: 'FAILED', code: 'CARD_DECLINED', message: 'The issuer declined the refund. Retry later.', latency: 120, at: { days: 24 } },
        {
          outcome: 'SUCCEEDED', code: 'APPROVED', message: 'Refund settled on the original payment method.', latency: 140,
          at: { days: 23 }, providerRef: 'PAY-MA-2026-0013',
        },
      ],
    },
    history: [
      { at: { days: 30 }, actor: 'u-bob', actorLabel: 'Bob Jensen', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED', reason: 'Defective, accepted under the 24 month warranty' },
      { at: { days: 29 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'decisions_recorded', from: 'UNDER_REVIEW', to: 'APPROVED' },
      { at: { days: 26 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'inspection_recorded', from: 'RECEIVED', to: 'INSPECTION_COMPLETE' },
      {
        at: { days: 25 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'refund_queued', from: 'INSPECTION_COMPLETE', to: 'REFUND_PENDING',
        detail: { amountMinor: 7900, idempotencyKey: 'RFN-RMA-2026-0013' },
      },
      { at: { days: 24 }, actor: 'u-max', actorLabel: 'Max Ivers', action: 'refund_failed', from: 'REFUND_PROCESSING', to: 'REFUND_PENDING', reason: 'CARD_DECLINED on the first attempt' },
      {
        at: { days: 23 }, actor: 'u-max', actorLabel: 'Max Ivers', action: 'refund_succeeded', from: 'REFUND_PROCESSING', to: 'REFUNDED',
        reason: 'Reused the same idempotency key, settled exactly once', detail: { providerRef: 'PAY-MA-2026-0013' },
      },
      { at: { days: 23 }, actor: null, actorLabel: 'system', action: 'closed', from: 'REFUNDED', to: 'CLOSED' },
    ],
  },
  {
    id: 'r-0014',
    reference: 'RMA-2026-0014',
    order: 'o-1010',
    customer: 'u-bob',
    status: 'CLOSED',
    overallReason: 'NOT_AS_DESCRIBED',
    payer: 'STORE',
    created: { days: 25 },
    submitted: { days: 25 },
    reviewer: 'u-zoe',
    reviewed: { days: 24 },
    items: [
      {
        id: 'ri-0014a', orderItem: 'oi-1010b', requested: 1, reason: 'NOT_AS_DESCRIBED', decision: 'APPROVED', approved: 1,
        receipt: 'NOT_RECEIVED', inspection: 'NOT_RECEIVED', inspectionComment: 'The parcel never reached the warehouse.',
      },
    ],
    history: [
      { at: { days: 25 }, actor: 'u-bob', actorLabel: 'Bob Jensen', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 24 }, actor: 'u-zoe', actorLabel: 'Zoe Kim', action: 'decisions_recorded', from: 'UNDER_REVIEW', to: 'APPROVED' },
      { at: { days: 20 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'goods_received', from: 'APPROVED', to: 'RECEIVED', reason: 'Registered as not received' },
      { at: { days: 20 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'no_refund_due', from: 'INSPECTION_COMPLETE', to: 'NO_REFUND_DUE', reason: 'Nothing arrived, so nothing is refundable' },
      { at: { days: 20 }, actor: null, actorLabel: 'system', action: 'closed', from: 'NO_REFUND_DUE', to: 'CLOSED' },
    ],
  },
  {
    id: 'r-0015',
    reference: 'RMA-2026-0015',
    order: 'o-1002',
    customer: 'u-ana',
    status: 'CANCELLED',
    overallReason: 'CHANGED_MIND',
    payer: 'CUSTOMER',
    created: { days: 4 },
    submitted: { days: 4 },
    items: [{ id: 'ri-0015a', orderItem: 'oi-1002a', requested: 1, reason: 'CHANGED_MIND', decision: 'PENDING' }],
    history: [
      { at: { days: 4 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 3 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'cancelled', from: 'SUBMITTED', to: 'CANCELLED', reason: 'Decided to keep the mug' },
    ],
  },
  {
    // Submitted yesterday and still waiting: keeps the operator queue non-trivial.
    id: 'r-0016',
    reference: 'RMA-2026-0016',
    order: 'o-1017',
    customer: 'u-ana',
    status: 'SUBMITTED',
    overallReason: 'NOT_AS_DESCRIBED',
    payer: 'STORE',
    notes: 'The mat in the box is purple, the listing said grey.',
    created: { days: 1 },
    submitted: { days: 1 },
    items: [{ id: 'ri-0016a', orderItem: 'oi-1017a', requested: 1, reason: 'NOT_AS_DESCRIBED', decision: 'PENDING' }],
    history: [
      { at: { days: 1 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'draft_created', from: null, to: 'DRAFT' },
      { at: { days: 1 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
    ],
  },
  {
    // A second pending appeal, this one rejected by Zoe so it is open to Sam.
    id: 'r-0017',
    reference: 'RMA-2026-0017',
    order: 'o-1018',
    customer: 'u-ana',
    status: 'APPEALED',
    overallReason: 'CHANGED_MIND',
    payer: 'CUSTOMER',
    created: { days: 2 },
    submitted: { days: 2 },
    reviewer: 'u-zoe',
    reviewed: { days: 1 },
    items: [
      {
        id: 'ri-0017a', orderItem: 'oi-1018b', requested: 1, reason: 'CHANGED_MIND', decision: 'REJECTED',
        rejectReason: 'The frother shows dried milk residue and is clearly used. Change-of-mind returns must be unused.',
      },
      {
        id: 'ri-0017b', orderItem: 'oi-1018a', requested: 2, reason: 'CHANGED_MIND', decision: 'REJECTED',
        rejectReason: 'Opened food items cannot be returned at all.',
      },
    ],
    appeal: {
      id: 'ap-0017',
      comment: 'The frother was never used; the residue is from the factory quality test, it was sealed when it arrived.',
      status: 'PENDING',
      created: { days: 1 },
    },
    history: [
      { at: { days: 2 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 1 }, actor: 'u-zoe', actorLabel: 'Zoe Kim', action: 'review_started', from: 'SUBMITTED', to: 'UNDER_REVIEW' },
      { at: { days: 1 }, actor: 'u-zoe', actorLabel: 'Zoe Kim', action: 'fully_rejected', from: 'UNDER_REVIEW', to: 'FULLY_REJECTED', reason: 'Used frother and opened food' },
      { at: { days: 1 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'appeal_submitted', from: 'FULLY_REJECTED', to: 'APPEALED', reason: 'Sealed on arrival, factory residue' },
    ],
  },
  {
    // A second fully paid-out request for the customer side of the story.
    id: 'r-0018',
    reference: 'RMA-2026-0018',
    order: 'o-1019',
    customer: 'u-ana',
    status: 'CLOSED',
    overallReason: 'DEFECTIVE',
    payer: 'STORE',
    created: { days: 7 },
    submitted: { days: 7 },
    reviewer: 'u-sam',
    reviewed: { days: 6 },
    items: [
      {
        id: 'ri-0018a', orderItem: 'oi-1019a', requested: 1, reason: 'DEFECTIVE', decision: 'APPROVED', approved: 1,
        receipt: 'RECEIVED', inspection: 'AS_DECLARED', inspectionComment: 'Space bar sticks; confirmed faulty under warranty.',
      },
    ],
    refund: {
      id: 'rf-0018',
      status: 'SUCCEEDED',
      at: { days: 2 },
      providerRef: 'PAY-MA-2026-0018',
      attempts: [
        {
          outcome: 'SUCCEEDED', code: 'APPROVED', message: 'Refund settled on the original payment method.', latency: 135,
          at: { days: 2 }, providerRef: 'PAY-MA-2026-0018',
        },
      ],
    },
    history: [
      { at: { days: 7 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'submitted', from: 'DRAFT', to: 'SUBMITTED' },
      { at: { days: 6 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'review_started', from: 'SUBMITTED', to: 'UNDER_REVIEW' },
      { at: { days: 6 }, actor: 'u-sam', actorLabel: 'Sam Patel', action: 'decisions_recorded', from: 'UNDER_REVIEW', to: 'APPROVED' },
      { at: { days: 3 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'goods_received', from: 'APPROVED', to: 'RECEIVED' },
      { at: { days: 2 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'inspection_recorded', from: 'RECEIVED', to: 'INSPECTION_COMPLETE' },
      {
        at: { days: 2 }, actor: 'u-lee', actorLabel: 'Lee Novak', action: 'refund_queued', from: 'INSPECTION_COMPLETE', to: 'REFUND_PENDING',
        detail: { amountMinor: 8900, idempotencyKey: 'RFN-RMA-2026-0018' },
      },
      {
        at: { days: 2 }, actor: 'u-max', actorLabel: 'Max Ivers', action: 'refund_succeeded', from: 'REFUND_PROCESSING', to: 'REFUNDED',
        reason: 'Refund settled on the original payment method.', detail: { providerRef: 'PAY-MA-2026-0018' },
      },
      { at: { days: 2 }, actor: null, actorLabel: 'system', action: 'closed', from: 'REFUNDED', to: 'CLOSED' },
    ],
  },
  {
    // A draft the customer gave up on before submitting.
    id: 'r-0019',
    reference: 'RMA-2026-0019',
    order: 'o-1020',
    customer: 'u-ana',
    status: 'CANCELLED',
    overallReason: 'CHANGED_MIND',
    payer: 'CUSTOMER',
    created: { days: 1 },
    items: [{ id: 'ri-0019a', orderItem: 'oi-1020a', requested: 2, reason: 'CHANGED_MIND', decision: 'PENDING' }],
    history: [
      { at: { days: 1 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'draft_created', from: null, to: 'DRAFT' },
      { at: { days: 1 }, actor: 'u-ana', actorLabel: 'Ana Torres', action: 'cancelled', from: 'DRAFT', to: 'CANCELLED', reason: 'Needed the A5 size after all' },
    ],
  },
];
