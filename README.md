# RMA — Return Merchandise Authorization

A return portal for an online store with four roles: **Customer**, **Support Operator**, **Warehouse Inspector** and **Finance**.
Built with Next.js (App Router) + React + TypeScript, MySQL 8 and Docker Compose.

## 1. Run it

The only requirement on the host is Docker (with Compose v2). No Node.js, no local MySQL.

```bash
docker compose up --build
```

Then open <http://localhost:4500>.

On the first boot the container waits for MySQL, applies `prisma/migrations/0001_init`, and loads `database/demo.sql`
(only when the `User` table is empty). A cold start takes a few minutes: the image installs dependencies and builds Next.js.

To stop: `Ctrl+C`, then `docker compose down` (keeps data) or `docker compose down -v` (drops the database volume).

## 2. Demo accounts

Every account uses the same password: **`rma-demo-pass`**. Sign in at `/login`.

| Username | Role | Workspace |
| --- | --- | --- |
| `customer.ana` | Customer | `/customer` (dashboard) |
| `customer.bob` | Customer | `/customer` (dashboard) |
| `operator.sam` | Support Operator | `/operator` |
| `operator.zoe` | Support Operator | `/operator` |
| `warehouse.lee` | Warehouse Inspector | `/warehouse` |
| `finance.max` | Finance | `/finance` |

Authorization is enforced on the server (every route handler and page re-checks the session, the role and, for
customers, the ownership of the order/request). A customer who opens `/finance` by hand is bounced to their own
workspace (307), the same call against the API is refused (403 `This action requires one of: FINANCE`), and another
customer's order id answers 404 — there is no "hidden button" trick anywhere.

## 3. Demo data map

26 orders (delivered 1–35 days ago, ~1 year ago, plus one still in transit) and 19 return requests — at least one per
implemented state. Dates are relative to the moment the container starts, so the return windows are always meaningful.
There are deliberately enough rows that Ana's order and request lists spill onto a second page, so search and
pagination are visible without creating data by hand.

| Request | Owner | Order | State | What it demonstrates |
| --- | --- | --- | --- | --- |
| `RMA-2026-0001` | Ana | ORD-1001 | `DRAFT` | Editable draft, quantities still changeable, not yet visible to operators as work |
| `RMA-2026-0002` | Ana | ORD-1002 | `SUBMITTED` | Sitting in the operator queue, no decision yet |
| `RMA-2026-0003` | Bob | ORD-1003 | `UNDER_REVIEW` | Sam opened it; line-level decisions still pending |
| `RMA-2026-0004` | Bob | ORD-1004 | `APPROVED` | Fully approved, awaiting goods (defective, 24-month window) |
| `RMA-2026-0005` | Ana | ORD-1005 | `PARTIALLY_APPROVED` | Mixed lines + customer pays return shipping (change of mind) |
| `RMA-2026-0006` | Bob | ORD-1013 | `FULLY_REJECTED` | Appealable — Sam rejected every line |
| `RMA-2026-0007` | Ana | ORD-1009 | `APPEALED` | Pending appeal waiting for an operator **other than Sam** |
| `RMA-2026-0008` | Ana | ORD-1007 | `CLOSED` | Appeal upheld by Zoe → `APPEAL_REJECTED` → closed (audit trail shows both) |
| `RMA-2026-0009` | Bob | ORD-1008 | `RECEIVED` | Warehouse logged the parcel, inspection not started |
| `RMA-2026-0010` | Bob | ORD-1011 | `INSPECTING` | One line inspected `WORSE_THAN_DECLARED` at 60%, one still pending |
| `RMA-2026-0011` | Ana | ORD-1014 | `REFUND_PENDING` | Refund record €45.00 created, provider not yet called |
| `RMA-2026-0012` | Ana | ORD-1012 | `REFUND_PROCESSING` | €79.98 stuck in `UNCERTAIN` after a gateway timeout — reconcile it |
| `RMA-2026-0013` | Bob | ORD-1006 | `CLOSED` | Happy path: 1 of 2 drills returned (partially returned item), €79.00 refunded after a declined first attempt |
| `RMA-2026-0014` | Bob | ORD-1010 | `CLOSED` | Inspection produced nothing refundable → `NO_REFUND_DUE` → closed |
| `RMA-2026-0015` | Ana | ORD-1002 | `CANCELLED` | Customer cancelled a submitted request |
| `RMA-2026-0016` | Ana | ORD-1017 | `SUBMITTED` | Second item in the operator queue, nothing decided yet |
| `RMA-2026-0017` | Ana | ORD-1018 | `APPEALED` | A second open appeal — Zoe rejected it, so **Sam** must decide |
| `RMA-2026-0018` | Ana | ORD-1019 | `CLOSED` | Second fully paid-out request: 8-step audit trail, €89.00 refunded |
| `RMA-2026-0019` | Ana | ORD-1020 | `CANCELLED` | Abandoned *draft* (never submitted), so the cancel path has two shapes |

ORD-1002 carries two requests (`…0002` submitted, `…0015` cancelled) to show that a cancelled request does not keep
its units reserved.

### Suggested walkthrough

1. **Ana** → `/customer`: the dashboard shows active returns, requests waiting on her, money refunded so far and
   unread alerts, plus recent activity. → `/customer/orders`: search `ord`, `keyboard`, `1021` or a product name, and
   page through the 26 orders (10 per page; the table collapses columns on a phone instead of scrolling).
   Pick ORD-1015 (delivered yesterday): choose a line, select *changed mind*, save a draft, edit it, submit. Note the
   shipping notice: change of mind means the customer pays return shipping.
2. **Bob** → ORD-1016 is `SHIPPED`, not delivered: the return form explains that nothing can be returned yet.
3. **operator.sam** → `/operator`: the queue is a dense, filterable table (status filter, search, 15 per page, how long
   each request has been waiting). Decide `RMA-2026-0003` line by line (rejecting a line requires a reason).
4. **customer.bob** → `/customer/requests/RMA-2026-0006`: appeal the full rejection (one appeal only).
5. **operator.zoe** → `/operator/appeals`: review `RMA-2026-0007`. Sam cannot do it — the rejector is always blocked.
   Switch to **operator.sam** and `RMA-2026-0017` is the one open to him. Overturning a line sends the request back to
   the warehouse queue.
6. **warehouse.lee** → `/warehouse`: one table for both stages (goods expected vs. ready to inspect), filter and
   search included. Record receipt on `RMA-2026-0009`, then inspect `RMA-2026-0010`. Once any line is
   inspected the customer can no longer edit the request.
7. **finance.max** → `/finance`: initiate `RMA-2026-0011`, then reconcile `RMA-2026-0012` (uncertain payout). The
   payout table shows the idempotency key, attempt count and outstanding total, and filters open vs. settled.
8. Anyone → `/notifications`: All/Unread tabs, 20 per page, and the timeline inside each request — every action is
   attributed and timestamped.

## 4. Payment provider stub and failure modes

Real PSP integrations are out of scope, so `/finance` has a **provider mode** switch (`POST /api/provider-mode`,
FINANCE only) that changes how the stub in `src/modules/refunds/provider-stub.ts` answers:

| Mode | Provider behaviour | What the app does |
| --- | --- | --- |
| `SUCCESS` | answers in ~120 ms, approved | refund `SUCCEEDED`, request `REFUNDED` → `CLOSED` |
| `SLOW` | answers after 3.5 s | the client gives up after 2.5 s → outcome `UNKNOWN`, refund `UNCERTAIN`, request stays `REFUND_PROCESSING` |
| `FAILURE` | `CARD_DECLINED` | refund `FAILED`, request back to `REFUND_PENDING`, retry allowed with the **same** idempotency key |
| `UNCERTAIN` | never answers (`GATEWAY_TIMEOUT`) | refund `UNCERTAIN`; only *Reconcile* can resolve it |
| `DUPLICATE` | replays the stored answer for a key that already settled | a new `RefundAttempt` row is recorded, flagged as a duplicate in the request history, and no second payout is made |

Reconcile asks the stub what really happened for that key: if the payout exists, the refund is marked `SUCCEEDED`;
if not, `NOT_FOUND` → `FAILED`, so the request can be retried. The stub keeps its ledger in process memory, so a
container restart forgets previous payouts (demo data in MySQL is unaffected).

Duplicate-refund protection, in order:

1. `Refund.idempotencyKey` is unique and derived from the request reference (`RFN-RMA-2026-XXXX`) — a second refund
   row for the same request is rejected by MySQL (`P2002` → HTTP 409).
2. The refund row is committed **before** any provider call, inside the same transaction that sets `REFUND_PENDING`.
3. Initiating a payout atomically claims it (`UPDATE … WHERE status IN ('PENDING','FAILED')`); a second click loses
   the race and gets 409 instead of a second transfer.
4. Retries reuse the same key, and every provider answer is stored in `RefundAttempt` with
   `@@unique([refundId, attemptNumber])`.

## 5. Business rules implemented

Server-side only (UI merely mirrors them) — see `src/modules/returns/domain.ts`:

- Standard returns: within **14 days** of delivery. Defective items: within the item's warranty (**24 months** by default).
- Requested quantity ≤ ordered quantity − units already returned or held by another active request.
- Reasons: `CHANGED_MIND`, `WRONG_ITEM`, `DEFECTIVE`, `DAMAGED_IN_TRANSIT`, `NOT_AS_DESCRIBED`.
- Return shipping (€4.99) is charged to the customer only when every line is `CHANGED_MIND`; the deduction is applied
  at the request total and never drives a refund below zero.
- Per-line approve/reject; a rejected line never reaches receipt, inspection or refund.
- Inspection: `AS_DECLARED` → 100%, `WORSE_THAN_DECLARED` → operator percentage 0–100, `NOT_RECEIVED` → 0%.
- Refunds go back to the original payment method of the order.
- One appeal per fully rejected request, reviewed by an operator other than the one who rejected it.
- Editing stops as soon as warehouse inspection has started on any line.
- Every transition is validated by one state machine (`src/modules/statemachine`) that all four roles share, and the
  only writer of `ReturnRequest.status`; each step is written to `RequestHistory` plus an
  `OutboxEvent`, and the outbox is drained into in-app notifications.

## 6. Resetting the database

```bash
# full reset (schema + demo data)
docker compose down -v && docker compose up --build

# reload only the demo rows (the dump deletes its own rows first)
docker compose exec -T db mysql -urma -prma-pass rma < database/demo.sql

# inspect the database
docker compose exec db mysql -urma -prma-pass rma -e "SHOW TABLES; SELECT reference, status FROM ReturnRequest;"
```

## 7. Development without Docker

Needs Node 20+ and a MySQL 8 server:

```bash
cp .env.example .env      # point DATABASE_URL at your MySQL
npm ci
npm run db:generate
npm run db:init           # migrate + load demo data
npm run dev               # http://localhost:4500
```

`npm run typecheck` and `npm test` (53 tests: domain rules plus the state-machine registry) run offline;
nothing in them requires a database.

## 8. Layout

```
prisma/                     schema + committed MySQL migration
database/demo.sql           mandatory demo dump (generated, re-runnable)
docker/start.sh             migrate -> seed -> next start
scripts/                    demo data generator, db bootstrap
src/app/login               sign-in page
src/app/(workspace)/        workspaces for the four roles + notifications
                            (customer lands on a dashboard; every queue is a searchable, paginated table)
src/app/api/                route handlers (the only place mutations happen)
src/components/             UI primitives, table/filter controls and server-rendered pagination
src/modules/statemachine/   the state machines: step registry (rules) + the only status writer (engine)
src/modules/{returns,appeals,inspection,refunds,history}   domain + services
src/lib/{auth,db}           sessions, RBAC helpers, Prisma client
tests/domain.test.ts        business-rule tests
tests/statemachine.test.ts  step registry, role guards and refund-state tests
Dockerfile, docker-compose.yml, DESIGN.md
```

Read `DESIGN.md` for the architecture decisions, assumptions and limitations.
