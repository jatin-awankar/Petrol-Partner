# 18: Share confirmed trip details without phone numbers

**What to build:** Confirmed passengers and their driver can identify each other and coordinate pickup through protected trip details and platform notices without sharing participant phone numbers.

**Blocked by:** 17 (Accept a seat without overbooking or overlap).

**Status:** ready-for-agent

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 17, 51, 52, 53. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [ ] Show a confirmed passenger the driver's verified name, make/model/colour, limited registration identifier, selected pickup and departure details.
- [ ] Show the driver each confirmed passenger's verified name and selected stops. No participant sees another participant's phone number.
- [ ] Check confirmation and relationship on every server response; public, pending, rejected and unrelated views expose no protected participant or trip detail.
- [ ] Enforce the 24-hour cutoff after trip completion/cancellation in server views with no shared caching. Use representative historical records for boundary tests until later lifecycle slices create them.
- [ ] Explain before offer publication/request that coordination uses trip details, durable in-app/email notices and the published operator support contact during operating windows, without direct participant phone access.
- [ ] Keep private and emergency contacts out of ordinary logs, analytics, URLs and notification metadata. Operator access for support or incidents is purpose-limited and audited.
- [ ] Test direct endpoint access, cross-user enumeration, cache headers, cutoff boundaries, no-phone exposure and both browser roles; rehearse a pickup exception without direct participant phone access.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.
