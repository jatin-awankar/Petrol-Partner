# 24: Record direct cash or UPI settlement

**What to build:** A passenger reports direct cash/UPI payment, and the driver confirms receipt while the application accurately shows what remains owed.

**Blocked by:** 22 (Confirm each passenger’s journey).

**Status:** claimed

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 44, 45, 46, 47, 57. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [ ] Deliver due/overdue obligation, passenger payment-claim and driver receipt-confirmation views; no platform charge, collection, escrow, payout or fee participates.
- [ ] Permit claims only for an established contribution and keep the accepted amount/currency immutable.
- [ ] A passenger claim never marks receipt or settlement complete. Only authorized driver receipt confirmation establishes the normal settled outcome.
- [ ] After 24 hours without a claim, show overdue visibility. A claim starts a separate 24-hour driver response window; silence or dispute opens review without automatic restrictions.
- [ ] Keep obligation, claim, receipt and settlement state distinct. Repeated claims/confirmations return the original logical result and cannot duplicate receipt records.
- [ ] Apply recovery-protected transactions, current participant authorization, audit and durable notification work to all settlement changes.
- [ ] Test driver/passenger role reversal, absent obligation, deadline boundaries, lost-response retries, evidence-store failure and the direct-settlement browser journey.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Answer

Implemented a direct cash/UPI settlement slice on `codex/24-direct-settlement`. A frozen pilot contribution obligation remains independent of a passenger claim, a driver confirmation or dispute, and a review case. A claim leaves the obligation unpaid; only the driver's receipt confirmation produces the normal settled view. Due and overdue status is computed at the exact 24-hour boundary. Driver silence opens a durable review case through the PostgreSQL worker; a dispute opens one in the protected transaction. No automatic account restriction is applied.

Evidence: PostgreSQL-backed HTTP tests cover wrong actors, absent obligations, frozen amount/currency, idempotent claims, payload mismatch, driver confirmation, exact deadline boundaries, dispute, silence worker retries, operator queue, failed email retry, evidence-store failure with restricted mode, and restoration from an independent claim receipt. A browser component test covers the passenger claim followed by the driver confirmation. `npm run lint` passed with 10 pre-existing warnings; `npm run typecheck`, `npm test`, `npm run api:build`, and `npm run worker:build` passed. The final `npm test` run reported 27 script passes with 4 skips, 117 API passes with 1 skip, and 16 worker passes.

Remaining limits: the browser journey test uses a mocked API client, while the corresponding HTTP flow is covered separately against PostgreSQL; an end-to-end browser session against the PostgreSQL HTTP server is not yet evidenced. `npm run build:all` could not complete because Next.js could not fetch the Poppins font from Google Fonts in the restricted environment. The deployed schema and user population were not inventoried or migrated. Real trips remain disabled. Ticket status remains claimed until the browser evidence and production build gate are completed.
