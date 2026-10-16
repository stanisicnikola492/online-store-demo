# Design notes

## 1. Shape of the system

**Modular monolith.** One Next.js app, one MySQL database, five workflow modules (`returns`, `appeals`, `inspection`,
`refunds`, `history`) plus one rules module (`statemachine`) that own their rules and talk to each other only through
functions and the database.
A micro-service split would add network hops and deployment surface without buying anything for a system this size;
the module boundaries still keep the refund logic from reaching into return logic, so a future split has seams.

Layers inside the monolith:

- `src/app` — presentation. Server components read through Prisma and render; **no business rule lives in a component**.
- `src/app/api/*` — application layer. Route handlers validate input with zod, resolve the session, call a module
  service and map domain errors to HTTP codes (`handleApi` in `src/lib/http.ts`).
- `src/modules/statemachine/*` — the state machines: which event may fire, from which state, to which state, for which
  role, and what it leaves behind in the audit trail. Pure rules plus the one writer of `return_request.status`.
- `src/modules/*/domain.ts` — pure functions: eligibility windows, shipping payer, refund maths,
  appeal rules. They take plain values and are the only place those rules are written.
- `src/modules/*/service.ts` — orchestration: load rows, apply domain rules, write inside a transaction.
- `src/lib` — infrastructure: Prisma client, sessions, RBAC, errors.

Orders and payments belong to external systems; here they are read-only tables that the demo dump fills.

## 2. The state machine is its own backend section

The most important decision is **not** to collapse everything into one status column.

- `ReturnRequest.status` — where the paperwork is (draft → submitted → under review → approved/partially/rejected →
  received → inspecting → inspection complete → refund pending/processing → refunded/no refund due → closed/cancelled/appeal rejected).
- `ReturnItem.decision`, `receiptStatus`, `inspectionResult` — what happened to each physical unit.
- `Refund.status` (+ `RefundAttempt`) — whether money actually moved.

Why: an approved request can have a failed payout, a partially approved request can have one line still uninspected,
and "rejected" on one line must not leak into the state of the others. Modelling this as one enum produces a
cartesian explosion of states and makes "what do I show the customer?" ambiguous.

`src/modules/statemachine/transitions.ts` (pure: no Prisma, no I/O) holds both layers of the rules:

- the **status graph**, `ALLOWED_TRANSITIONS`, which states may ever follow one another;
- the **step registry**, `REQUEST_STEPS`, keyed by business event. Each step declares `from`, `to`, the roles allowed
  to fire it, the audit action name, the message a refusal returns, and whether it moves the status column or is only
  an event on the trail.

`engine.ts` is the only code in the backend that writes `return_request.status`: `applyStep(tx, …)` checks the role and
the state, writes the status together with any side columns in the same UPDATE, and records the history and outbox row
in the same transaction. A service can no longer invent its own precondition, its own wording, or an event that
leaves no trace.

Why this shape:

- **One shared rule set for four roles.** The customer's submit/cancel/appeal, the operator's review/decisions/appeal
  decision, the warehouse's receipt/inspection and the finance payout are rows in the same table;
  `stepsFor(role, status)` derives what a user may do next instead of each page guessing it.
- **The graph and the services cannot drift.** They had drifted: the table refused `APPEALED → APPROVED/PARTIALLY_APPROVED`,
  which is precisely what an overturned appeal does, and the guards were only reachable from tests. A registry test now
  asserts every step edge exists in the graph, so widening one side without the other fails the suite.
- **A refusal is a 409 or a 403, never a 500.** `assertTransition` used to throw a bare `Error`, which `handleApi` would
  have reported as a crash.
- **Money keeps its own shape.** The atomic `updateMany` claim stays in the finance service, but the states it may claim
  from (`REFUND_CLAIMABLE`), the settle edges (`PENDING → PROCESSING → SUCCEEDED | FAILED | UNCERTAIN`, retry
  `FAILED → PROCESSING`) and the reconciliation rule come from the machine.

Backward compatibility was the constraint, so the refactor changed no observable behaviour: exported service signatures,
every `request_history.action` string (the demo dump and the audit trail are written in those names), every 409 message,
and the two status writes that deliberately have no audit row (`RECEIVED → INSPECTION_COMPLETE` during finalisation,
and `REFUND_PENDING → REFUND_PROCESSING` when a payout is claimed) all behave exactly as before. `assertTransition` and
`canTransition` are still exported from `returns/domain.ts`.

## 3. Rules and authorization live on the server

- Sessions: an opaque 32-byte token from `crypto.randomBytes`, stored as a SHA-256 hash in `Session`, delivered in an
  httpOnly cookie. Passwords use bcrypt. A second, non-httpOnly `rma_role` cookie exists **only** so middleware can
  route a user to their workspace; nothing trusts it — each page and handler calls `requireUser`/`requireRole`, and
  customer reads always filter by `customerId`. A customer who guesses another user's request id gets 404/403.
- The `rma-demo-pass` accounts cover the four roles so the reviewer can exercise the whole flow without an onboarding system.

## 4. Money, idempotency and the outside world

A database transaction cannot make an external payment atomic, so the design assumes the network can lie, repeat or
hang:

1. The `Refund` row (with its unique, request-derived idempotency key) is committed **before** the provider is called,
   and only after inspection has fixed every line's final amount.
2. Initiating a payout is an atomic claim (`updateMany` guarded by the states the machine publishes as
   `REFUND_CLAIMABLE`), so two finance users clicking the same button produce one provider call; the loser gets 409.
3. Every provider answer is persisted as a `RefundAttempt` (`@@unique([refundId, attemptNumber])`), including
   duplicates and timeouts, and the request's audit trail references it.
4. Outcomes the app cannot verify become `UNCERTAIN`, which is a real state with its own action — *Reconcile* queries
   the provider by key and settles to `SUCCEEDED` or `FAILED`. Retry always reuses the original key, so a replayed
   request is recognised by the provider stub and cannot pay twice.
5. Amounts are computed in integer cents (`toMinor`/`fromMinor`) and Prisma `Decimal` columns, never floats.

The provider stub is a module-level function with a mode switch (`SUCCESS`, `SLOW`, `FAILURE`, `UNCERTAIN`,
`DUPLICATE`) and an in-memory ledger keyed by idempotency key — a seam a real PSP would slot into, not a special case
in the refund service.

## 5. History and notifications

`recordHistory()` runs inside the caller's transaction and writes both a `RequestHistory` row (actor, action,
from/to status, reason, structured detail) and an `OutboxEvent`. Delivery is a separate step
(`deliverOutboxEvents`) that turns events into in-app `Notification` rows; it is invoked from the workspace layout and
when notifications are read. This **transactional outbox** means a business action and its notification can never
diverge, and swapping the channel (email, webhook, SMS) touches one function. A real deployment would drain the outbox
from a worker rather than from a page render — same schema, different trigger.

Since `applyStep` is the only writer of a status, the `from`/`to` pair in each audit row is the transition the machine
just took, not a string a service happened to pass; the action name is likewise the one the step declares. Two steps
(`RECEIVED → INSPECTION_COMPLETE` during finalisation and `REFUND_PENDING → REFUND_PROCESSING` when a payout is claimed)
move the status without an audit row because the event that encloses them is already on the trail.

## 6. Chosen tools

- **Prisma + MySQL 8** — the brief mandates MySQL; Prisma gave typed enums, `Decimal` support and a single generated
  migration (`0001_init`) that `migrate deploy` applies inside the container. Alternative: raw `mysql2` with
  hand-written SQL — fewer moving parts but no typed client, and every query would need manual escaping.
- **App Router + server components + route handlers** — reads are server-rendered (no API round-trip per screen),
  writes are explicit HTTP endpoints so authorization is auditable in one place. Alternative: server actions — fewer
  files, but easier to accidentally put logic in a component.
- **Tailwind, mobile-first** — one small stylesheet (`globals.css`). Staff screens (operator, warehouse, finance,
  notifications and the customer lists) are dense admin **tables** with server-side search and pagination; the customer
  dashboard is the only card-based screen, because it answers "what needs me today?" rather than "find row X". See §7.
- **Docker Compose** — `db` (mysql:8.0, healthchecked) + `app`; `docker/start.sh` waits for MySQL, migrates, seeds
  and starts Next on 4500. Demo dates are relative to container start (`DATE_SUB(UTC_TIMESTAMP(3), …)`) so the
  14-day/24-month windows are still valid when the reviewer boots the stack.
- **Vitest** — 53 tests. `tests/domain.test.ts` covers the pure rules (windows, quantity limits, shipping payer, refund
  maths, appeal rules); `tests/statemachine.test.ts` covers the machine itself — every step edge against the graph, the
  role guards, the audit action names and the refund states. No DB-dependent test suite: the graded surface is
  behaviour, and the rules most likely to rot are exactly the ones the tests pin down.

## 7. Interface decisions

The screens are shaped around the question each role actually asks.

- **Customer `/customer` (dashboard)** — "where is my return?": four figures (active, waiting on you, refunded,
  unread alerts), recent requests, recent deliveries and a three-step explanation of the process with the two windows
  spelled out. It is the landing page after login, so a customer never has to guess which tab holds the answer.
- **Staff queues are tables, not cards** — operator, warehouse, finance and the customer's own lists are scannable
  rows with one primary action per row. A support agent working a queue reads 20 rows a minute; a card grid optimises
  the page for nobody.
- **Search and pagination are server-side** — the filter bar is a plain GET form (`SearchBar`), and the page component
  passes `q`/`status`/`page` into a single Prisma `where` used by both `findMany({ take, skip })` and `count`. No
  client data layer, no "load everything and filter in JS", and the links are shareable and back-button safe.
  `Pagination` rebuilds the query string from the surviving filters so changing page never drops a search.
  MySQL's `utf8mb4_unicode_ci` collation makes `contains` case-insensitive, so no `mode: 'insensitive'` (which Prisma
  does not support on MySQL anyway). Filter values are whitelisted against the enum before they reach Prisma
  (`pickEnum`): a hand-typed `?status=settled` means "no filter", not a 500.
- **Every list stays role-filtered at the database level** — the customer search only ever runs inside
  `where: { customerId: user.id }`, so a search box cannot widen data access.
- **Responsive by dropping columns, not by scrolling** — secondary columns are `hidden sm/md/lg:table-cell`; a phone
  in a warehouse shows reference, stage and one large button. `EmptyState` keeps the table frame visible when a filter
  matches nothing, so the filter controls stay on screen to be cleared.

## 8. Assumptions

- "Two years" for defective items is read as the product's warranty, so it is per order item (24 months by default).
- Return shipping is a fixed €4.99 per request, not a per-carrier quote.
- One refund per return request (partial payouts would need a split of `Refund` across lines).
- Appeals only make sense for a *fully* rejected request, as the brief states; a partially approved request goes to
  the warehouse instead.
- Notifications are in-app only; no email provider is configured.
- Orders in the demo are all single-parcel and EUR-denominated.

## 9. Known limitations

- The provider ledger is process memory: restarting the container clears what the "provider" remembers (the app's own
  state in MySQL survives). A real integration stores this server-side.
- Concurrency is guarded where money is involved (refund claims) but a double *submit* of the same draft relies on the
  unique reference and quantity re-validation rather than row locks.
- No CSV export in the operator/warehouse/finance queues, and filters are per-request rather than saved/shared.
- No i18n, no product images, no partial-unit returns (units are integers), no exchange/repair outcomes.
- Auth has no password change, rate limiting or lockout; sessions expire by `expiresAt` but there is no sliding renewal.
- Tests cover the domain layer only; route handlers and components are verified by hand, not automated.

## 10. If I had another week

1. Integration tests against a throwaway MySQL (test-containers), so the services that *drive* the state machine and
   the refund races are covered, not only the rules themselves.
2. Split payouts and multi-parcel receipts, plus exchange/repair as inspection outcomes.
3. A real worker for the outbox with email/SMS channels and delivery retries.
4. Queue UX: saved/shared filters, column sorting, bulk inspection and a dedicated "needs attention" surface for
   `UNCERTAIN` refunds.
5. Auditable admin tooling (impersonation with reason, reversible data fixes) and metrics/alerts on failed refunds.

## 11. How AI was used

Claude (via the Qoder CLI) drafted the bulk of this repository in one working session:

- **Generated then kept**: the Prisma schema and its migration, the module skeletons (services, route handlers), the
  responsive UI for the four roles, the demo-data generator and `database/demo.sql`, `tests/domain.test.ts`, and this
  README/DESIGN pair.
- **Generated then rewritten**: the first demo dataset — it silently broke the rules it was supposed to illustrate
  (change-of-mind requests on 20-day-old deliveries, requests created before their order was delivered, two active
  requests oversubscribing one order line). It was rebuilt from a scenario table with a validator that parses the SQL
  and checks every row against the DDL. The first refund flow also called the provider inside a transaction; that
  became claim-then-call-then-settle.
- **Discarded**: an `AWAITING_GOODS` status (it duplicated `APPROVED`/`PARTIALLY_APPROVED`), a bespoke
  `NotFoundError extends ConflictError` in the appeal service, and a client-side-only validation pass — the same rules
  had to be enforced server-side anyway, so the duplicate was deleted.
- **Centralised after the fact**: the status table began life in `returns/domain.ts` as code only the tests called,
  while each service kept its own precondition, its own role list and its own audit triple. That version had drifted
  from the workflow it claimed to describe — `APPEALED → APPROVED` was illegal on paper and normal in the code — so the
  rules moved into `src/modules/statemachine` and the services lost their private copies. The observable surface was
  pinned first: audit action names, refusal wording, the two unaudited status writes and all 28 original tests still
  pass unchanged.
- **Human-reviewed**: every business rule was checked against the brief line by line (14-day and 24-month windows,
  quantity reservations, customer-paid shipping deduction, one appeal by a different operator, no edits after
  inspection started), plus the Docker-only startup path and the idempotency reasoning above.
