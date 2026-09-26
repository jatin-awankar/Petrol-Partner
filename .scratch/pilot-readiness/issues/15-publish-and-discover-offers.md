# 15: Publish and discover a corridor offer

**What to build:** Eligible drivers publish offers for approved cars and configured stops, and students can discover the price, timing and available capacity before requesting.

**Blocked by:** 14 (Driver and car approval).

**Status:** claimed

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 15, 16, 17, 23, 24, 27, 40, 60. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [ ] Deliver a minimal operator-configured directional corridor, permitted stops, duration/buffer, contribution table and operating schedule. Synthetic provisional policy is sufficient for development; ticket 05 supplies actual launch policy.
- [ ] Require current student/driver/car/association eligibility, relevant pause controls and support coverage at publication; no phone eligibility check applies.
- [ ] Publish fixed whole-ride passenger capacity within the approved car's limit, exact contribution in integer paise, selected stops, departure, cutoffs and cancellation/contact-sharing notices.
- [ ] Snapshot policy, contribution version and scheduled commitment interval. Atomically reject overlapping driver commitments across roles and shared-car commitments across drivers.
- [ ] Return only permitted stop pairs and relevant eligible offer information in discovery; expose no participant phone numbers at any stage and no raw evidence.
- [ ] Allow audited material changes before the first request while preserving conflicts and current eligibility; provide locking/version hooks for request-time freezing in ticket 16.
- [ ] Use the protected acknowledgement protocol, stable operation IDs, audit and durable events for publication. Test concurrent publication, stale eligibility, paused/out-of-window publication and private discovery responses through HTTP and browser.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.
