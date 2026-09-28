# 01: Approve broader eligibility and vehicle rules

**What to build:** The operator has a documented unrestricted eligibility and vehicle rule for adult declarations and individual bikes, scooters, and cars beyond the college pilot.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Define the chosen adult, driver, and vehicle declaration policy, review intervals, expiry, renewal, revocation, and category-specific safety and capacity rules.
- [x] State how historical PRMITR approvals are distinguished from unrestricted status; no silent promotion occurs.
- [x] Record the decision and reviewer so implementation and launch checks use one current policy.

## Answer

**Decision date:** 2026-09-28. **Policy version:** `unrestricted-declared-2026-09-28.1`. **Reviewer:** Project maintainer (role supplied by the decision maker; personal name not supplied). This decision amends `.scratch/unrestricted-booking/spec.md` for the unrestricted product. It is a product-policy decision, not evidence of regulatory or insurer approval or permission to enable real bookings.

Anyone may create an account through verified email ownership or Google sign-in. Student status is not required. Before participating, users declare that they are at least 18. Drivers declare a valid category-appropriate driving licence and current registration, insurance, and permission for the vehicle they register. The platform performs no pre-booking document review of age, licence, registration, insurance, or permission under this version. User declarations must not be labelled independent verification or approval. A declaration does not establish that the person or vehicle is legally eligible.

The supported categories are bike, scooter, and car. A bike or scooter offers at most one passenger seat, and both riders must wear helmets. A car offers no more than its declared, individually recorded belted passenger-seat capacity, excluding the driver. The platform does not independently inspect the seat count. Every confirmed passenger consumes one seat for the whole ride.

Reconfirm adult and driver–vehicle declarations every 12 months or at the earliest declared document expiry, whichever comes first. Immediately suspend new protected actions on known expiry, lost permission, material vehicle change, credible safety concern, or known false declaration; use recorded holds, incidents, and review for existing commitments. Historical PRMITR adult, driver, and car approvals remain historical. Each person and vehicle receives a fresh assessment against this unrestricted declaration policy; no approval is silently promoted or represented as current document verification.

**Evidence and limit:** The maintainer explicitly chose bookings without document checks, fresh review of historical approvals, recommended safety/capacity and renewal rules, and delegated the reviewer description to a suitable role. Google sign-in establishes email claims, not adult or licence status ([Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)). DigiLocker requester integration requires partner onboarding ([DigiLocker implementation model](https://www.digilocker.gov.in/web/implementation-model)); manual spot checks exist but were not selected for this policy ([DigiLocker FAQ](https://wb.digilocker.gov.in/web/about/faq)). Ticket 03 must assess transport and insurer treatment of operation without documentary verification. Dependent tickets 07 and 08 must be reconciled with this amended policy before implementation. Implementation, testing, migration, operations, and the explicit launch decision remain separate gates. Real bookings stay disabled.

The dated comments below preserve the discussion history. Where they conflict with this answer, this answer and the amended unrestricted specification govern new work.

## Comments

### 2026-09-28 — Policy review prepared; maintainer decisions pending

Reviewed `.scratch/unrestricted-booking/spec.md`, `docs/pilot-spec.md`, `docs/pilot-operating-policy.md`, the verification schemas and review services, and `pilot-eligibility.sql.ts`. This is a policy proposal and source inventory, not an approval or implementation.

- The new product direction permits applications without college affiliation but requires current adult verification before a real booking, plus driver and individual vehicle approval to offer or depart. Historical PRMITR approval cannot silently grant unrestricted approval.
- The implemented pilot still requires verified email and PRMITR enrollment plus age evidence; driver licence evidence, private car/SUV registration and insurance evidence, any applicable vehicle document, and driver–vehicle permission evidence receive operator review. Approval has review dates; current licence, insurance, registration (if applicable), and review dates are checked. Bikes and scooters are not supported by that review path.
- The previous operating-policy proposal's one-passenger two-wheeler and three-passenger car caps are historical development evidence, not a current unrestricted approval. The new spec fixes one passenger maximum for bikes/scooters and individual approved capacity for cars, with no segment seat reuse.
- Recommended policy for human decision: accept a legible government-issued proof of age and name, with an operator recording only adult eligibility and minimal decision metadata; require a current licence for the vehicle category, current registration and insurance for each vehicle, documented permission for each driver–vehicle pair, and category-specific safety checks. Set a twelve-month review cycle capped by the earliest document expiry, with immediate suspension on expiry, loss of permission, changed vehicle details, or credible safety concern. Re-review legacy approvals under a new unrestricted policy version and preserve their historical status.
- External transport and insurer treatment remains a separate launch blocker in ticket 03; no category or document choice here establishes that real trips are permitted. Real bookings remain disabled.

**Awaiting maintainer decisions:** acceptable adult evidence and whether an existing PRMITR age review can be reused after a new broader-policy review; driver/vehicle evidence and eligible ownership/use categories; exact bike/scooter and car safety/capacity rules; review cycle and revocation triggers. Record the policy version, decision date, and named reviewer after the maintainer answers. Status remains `ready-for-human`.

### 2026-09-28 — Maintainer answers and verification-option findings

The maintainer chose email or Google sign-in for access to the platform because paid document and driving-licence verification is not currently affordable. They want a free verification option if one is workable. This settles **account access/application**, not adult or driver approval for real bookings: the approved unrestricted specification requires current adult verification before confirmation and driver–vehicle approval before offering or departure. The maintainer did not approve removing those requirements, and this ticket does not override them.

The maintainer accepted the recommended safety/capacity rule: bikes and scooters carry at most one passenger, both riders wear helmets, and a car carries no more passengers than its individually approved belted passenger seats excluding the driver. They delegated renewal and revocation timing to the recommended rule: review every 12 months or by the earliest relevant document expiry, whichever is sooner; suspend immediately on expiry, lost permission, material vehicle change, or credible safety concern. Implementation and external applicability remain pending.

Current official-source findings: Google's sign-in token can attest `email_verified`, but that claim does not establish age, student status, licence, or vehicle approval ([Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)). DigiLocker requester API access requires an approved partner onboarding process; no generally available free API entitlement was established ([DigiLocker implementation model](https://www.digilocker.gov.in/web/implementation-model), [API Setu DigiLocker resource center](https://apisetu.gov.in/digilocker)). DigiLocker describes spot verification of digital driving licences and registration certificates by signature or QR ([DigiLocker FAQ](https://wb.digilocker.gov.in/web/about/faq)); this may support a low-cash-cost manual operator review, but staffing and document handling still have costs and the exact workflow needs approval. No free automated student or adult verification method has been established. Student status is no longer an unrestricted eligibility requirement.

**Still unresolved:** whether to use a manual, consent-based review of user-provided age, licence, registration, insurance, and permission evidence before real bookings, or revise the approved product specification to permit unverified participants; the exact evidence accepted for each category; treatment of historical PRMITR approvals; and the named policy reviewer. A self-declared vehicle or sign-in alone is not recorded as an unrestricted approval. Ticket remains `ready-for-human`, and real bookings remain disabled.
