# Controlled pilot specification

This is the approved product and operational contract for the first Petrol Partner pilot. Read the sections touched by a change and preserve every applicable invariant. The broader architecture review remains a proposal; this document records the settled pilot behavior.

## Scope and launch gates

The pilot serves 20–30 verified students aged 18 or older from Prof. Ram Meghe Institute of Technology and Research. It supports approved private cars on a small predefined set of stops along the Amravati University–PRMITR corridor. The initial success target is ten real completed trips.

The pilot supports this lifecycle: publish offer → discover offer → request one seat → driver accepts or rejects → start trip and record boarding → confirm journey → record contribution → passenger reports payment → driver confirms receipt or disputes it.

Real trips require all of the following evidence:

- Interviews with at least ten students validate repeated corridor demand and available seats.
- The contribution table, stops, expected duration, scheduling buffer, support windows, cancellation policy, and fallback contact are configured and published.
- Applicable Maharashtra transport treatment is established from current authoritative material for this exact closed cost-sharing model.
- Each participating car and driver has appropriate insurer confirmation; PRMITR has confirmed pickup, parking, and access arrangements.
- Privacy notice, document deletion, authentication migration, backup, restore, restricted-mode, and incident procedures have been rehearsed against the deployed providers.
- Critical authorization, lifecycle, concurrency, idempotency, notification, and recovery tests pass against PostgreSQL.
- No unresolved P0 correctness, security, migration, or recovery finding remains.

Public launch, other colleges or corridors, motorcycles, taxis, rented cars, minors, guest or group passengers, platform payment collection, platform fees, payouts, passenger-posted ride requests, automatic matching, dynamic stops, seat reuse, chat, live tracking, and push notifications are outside this pilot.

## Identity and eligibility

Authentication proves identity; current application state grants authority. Every protected server operation checks the authenticated application user and the eligibility relevant at that moment. Existing JWT role claims alone do not grant operator access or survive a revocation check.

Students require verified email ownership, manually verified phone ownership, current enrollment evidence, age eligibility, and operator approval. Offering or starting a ride additionally requires current approval of the driver, the selected car, and that driver-car association. A car approval records expiry or review date, status, reviewer, and audit history. Revocation takes effect immediately for new protected actions.

Operator access uses an explicit allowlist, individual accounts, strong authentication, MFA, current server-side authorization, and an audit record for every state change. Authentication-provider IDs map explicitly to stable application-user IDs. Any authentication migration inventories every existing user and relationship, rehearses identity mapping and cutover, invalidates the old sessions, and retains a recovery path.

A phone verification code is random, short-lived, single-use, attempt-limited, stored only as a hash while pending, and absent from logs. A replacement phone remains private and unverified until another ownership check succeeds. Users without a verified phone cannot create offers or requests; existing confirmed commitments enter operator review if contact is lost.

## Offers, requests, and capacity

An offer identifies one approved driver and car, predefined origin/destination/stops, departure time, whole-ride seat capacity, contribution per permitted stop pair, request deadline, and cancellation terms. Every accepted passenger consumes one seat for the entire ride; seats are not reused by segment.

A verified passenger requests exactly one seat for themselves. A pending request consumes no capacity and remains visibly unconfirmed. Requests close 60 minutes before departure. The driver accepts or rejects no later than 30 minutes before departure; unanswered requests expire at that deadline even if background processing is late.

Acceptance is one atomic server transaction. It rechecks current eligibility, holds, frozen offer terms, deadlines, capacity, and commitment conflicts; allocates exactly one slot; freezes the contribution; records audit and follow-up work; and withdraws incompatible pending requests. Competing acceptance for the final slot yields one success and no overbooking.

Students may hold multiple pending requests. A student cannot hold overlapping confirmed commitments as driver or passenger. A car cannot serve overlapping rides. Conflict intervals cover departure through configured expected arrival and buffer. Creating, accepting, rescheduling, cancelling, revoking, and departing use the same server-side conflict model.

After the first request, driver, car, stops, departure, price, capacity, and other material terms are frozen. A material change cancels the existing offer and its requests/bookings with notification, then creates a new offer with a new identity. Historical records remain intact and are never transferred silently.

## Trip and cancellation lifecycle

A driver may start the trip only from 15 minutes before through 30 minutes after scheduled departure, while the driver, car, offer, commitments, and support window remain eligible. At departure the driver records which confirmed passengers boarded. This does not create passengers or change contributions.

At 30 minutes after scheduled departure, an unstarted ride becomes delayed and requires explicit driver or operator resolution. Time passing never starts, completes, or cancels a trip automatically.

Before departure, a passenger cancellation atomically releases their allocation and records actor, timestamp, and optional reason. A driver cancellation moves the offer and every affected booking to explicit cancelled states and notifies all participants. After start, absence, interruption, disagreement, or attempted cancellation creates an operator review case. The pilot imposes no automatic cancellation or no-show charge.

Revocation blocks new protected actions immediately. Passenger revocation places future bookings on hold; the seat is released only through a recorded cancellation. Driver or car revocation holds the entire future ride. Safety revocation prevents departure. Revocation during an active trip preserves visibility and creates a high-priority incident.

## Journey and settlement

Driver completion does not create debt by itself. Each passenger confirms whether they travelled and whether the journey completed. Mutual confirmation creates the contribution obligation. Disagreement or passenger silence for 24 hours creates operator review; silence never manufactures debt.

Contributions come from an operator-approved table for the corridor and stop pair. They approximate shared fuel and disclosed tolls, include no platform fee, are visible before request, and are copied and frozen at acceptance independently of later occupancy. Drivers cannot alter a confirmed amount.

The contribution is due within 24 hours after mutual journey confirmation or an operator decision that travel occurred and payment is owed. A missing payment claim becomes overdue for operator visibility. A passenger's payment claim never settles the obligation. The driver has 24 hours to confirm receipt or dispute it; silence creates operator review.

Journey outcome, contribution obligation, payment claim, receipt, settlement status, and case outcome are separate records. Operator resolutions preserve original claims and record outcome, reason, evidence references, operator, timestamp, and resulting account action. Closing a case never implies that travel or payment occurred. Restrictions and reversals are manual, reasoned, and auditable.

## Privacy and communication

Persistent in-app notifications record every relevant state change. Email covers acceptance, rejection, expiry, cancellation, departure changes, holds, verification, settlement, and incidents. Delivery failure does not undo business state. Durable notification work records recipient, event, related entity, channel, status, attempts, last error, and timestamps; retries are bounded and exhausted work remains visible.

During operating windows, the first important notification attempt targets one minute. Work stalled for more than five minutes creates an alert independent of the worker being monitored. Deadlines and protected policy checks remain synchronous when background work is unavailable.

Confirmed participants in the same ride may see verified names, verified phone numbers, pickup details, and limited car identification required for coordination. Pending, rejected, unrelated, and public views expose no participant phone number. Ordinary trip access to contact details ends 24 hours after completion or cancellation. Phone numbers, codes, raw documents, and sensitive identifiers stay out of logs, analytics, notification URLs, and caches.

Raw verification evidence lives in restricted private storage separate from durable decision records and normal database backups. Operator-only short-lived access, safe upload validation, previews, temporary copies, and retryable deletion all follow the same policy. Raw evidence is deleted within seven days of a decision unless an active review or incident has an approved hold. Provider-side retention must be described accurately.

Unused onboarding records expire after 30 days. Routine pilot history and direct contact data are deleted or anonymized within 90 days after pilot end or account closure, subject to a recorded unresolved-case hold. Deletion covers primary data, files, caches, exports, providers where controllable, and backups as they expire. A deletion receipt retains no deleted personal content.

## Durability and operations

Protected mutations include eligibility decisions, ride publication/cancellation, acceptance/cancellation, allocation, trip and boarding changes, journey confirmation, settlement/dispute changes, restrictions, and operator resolutions.

An acknowledged protected mutation must be recoverable from the primary database or independently identifiable and reconcilable after restoration. The database recovery-point target is at most one hour; restoration or safe read-only service targets four hours during support windows. Backups alone do not satisfy acknowledgement recovery.

The mutation protocol uses a stable operation ID and idempotency key. Business state, audit, result, and durable follow-up work commit in one PostgreSQL transaction. Success is published only after the approved independent recovery evidence is durable. An uncertain outcome remains pending/unknown under the same operation ID; it never becomes a definitive failure that encourages an unsafe duplicate.

Failure or uncertain health of required recovery evidence enters visible restricted mode before more protected mutations are acknowledged. Safe reads and recovery continue. The operator console exposes the failure and start time. Urgent out-of-band actions use the documented fallback record and are explicitly reconciled before the operator manually restores writes.

Important background work uses durable status, due time, attempt count, lease, retry, exhausted state, and idempotent handlers. Redis is never the sole evidence of accepted work. Readiness distinguishes process health, database health, worker freshness, backup freshness, and permission to accept protected mutations.

The operator console supports eligibility, holds, journey/settlement review, incidents, restrictions, system pause, notification retries, backup/recovery status, and audit history through validated domain operations. It does not bypass invariants with arbitrary database edits.

## Required verification

At minimum, verify these with separate PostgreSQL connections and controlled clocks where applicable:

- Two acceptances for the final seat produce one allocation.
- The same passenger, driver, or car cannot acquire overlapping active commitments.
- Cancellation and retry release a seat exactly once.
- Acceptance, departure, cancellation, and revocation races end in valid serial states.
- Expired requests, frozen terms, holds, stale eligibility, wrong owners, stale operator access, missing MFA, and cross-user contact/document access fail server-side.
- Retry with the same idempotency key returns the same logical result; a changed payload under that key is rejected.
- Timers create delayed, overdue, or review states without creating travel or payment facts.
- Notification send failure leaves the committed business action intact and retryable.
- Crash injection at every acknowledgement boundary plus restoration of an older snapshot identifies every newer acknowledged protected operation.
- Restore validation reconciles identity mapping, capacity, commitments, journey outcomes, settlements, deletion records, and fallback incidents before writes reopen.
