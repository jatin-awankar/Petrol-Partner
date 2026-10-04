# Ticket 10 boundary source amendment — proposed, not approved

The maintainer subsequently approved geoBoundaries for **candidate evaluation only**, explicitly withholding production adoption and any accuracy/completeness waiver. The [follow-up assessment](ticket10-boundary-adoption-assessment-2026-10-04.md) fails the adoption evidence gate; the replacement text below remains unapplied.

This proposal changes source selection only. It is **not ready for unconditional artifact adoption**. No evaluated alternative currently meets the approved accuracy requirement. Approval must not be recorded as completion of ticket 10 or as unblocking ticket 11.

## Exact proposed policy text

If approved, replace the SOI-only source-selection paragraph in `docs/operations/unrestricted-booking-operating-policy.md` with:

> Select the full-resolution geoBoundaries gbOpen India ADM1 dataset `IND-ADM1-1811400`, Maharashtra feature `IN-MH` / `1811400B15614733245507`, repository commit `9469f09592ced973a3448cf66b6100b741b64c0d`, as the candidate operational service-area representation. Its represented year is 2011, source update is 2023-01-19 and build date is 2023-12-12. It is DataMeet/ECI-derived administrative data, not an authoritative legal determination. Retain source-specific CC BY 2.5 IN notices, geoBoundaries credit and applicable CC BY 4.0 notices, source links and adaptation details with every retained or redistributed derived artifact. The selected full GeoJSON has SHA-256 `47aa0acb6f69868daee49143276f3ce323f18905ba7d38d0a86816b405028736`; the unchanged-coordinate Maharashtra MultiPolygon normalization has SHA-256 `71ed889b914ce89fb134533c8c9f209dfbbc46f403db10744cca530906f7667d`. These pins authorize no runtime fallback or automatic update. Adoption remains conditional on validating positional uncertainty and the implications of its island/hole representation, then passing ticket 10's complete actual-artifact and authenticated PostgreSQL checks. Missing, invalid, mismatched or unapproved evidence blocks publication and later area-dependent actions.

Retain the following existing requirements verbatim in effect: requested and routed endpoints strictly inside; no snapping across the boundary; uncertainty exclusion derived from validated accuracy; all source parts and holes preserved; cumulative outside travel at most 5,000 m/600 s with whole-segment/provider-edge upper bounds; immutable provenance, audit and recovery; historical records unchanged; bookings disabled.

On approval, add a dated amendment to the current specification and ticket 04 decision history, update the ticket 10 checklist and runbook to refer to the approved candidate instead of SOI, and assign a fresh policy version only when its actual adoption is implemented. Keep all outstanding artifact work in ticket 10. Do not alter ticket 11 or mark any requirement complete by cross-reference.

## Tradeoff and recommendation

This removes dependence on an unanswered SOI reuse request for the candidate's openly licensed geometry. It gives up government-source selection in favour of an older community-derived representation with a documented but unquantified shift. It is not an improvement in demonstrated geographic accuracy. The candidate has 3 components and no holes, compared with the inspected SOI geometry's 93 components and 2 holes; these counts alone do not establish which features are correct. An independent accuracy and completeness assessment is still necessary.

Recommend approving this **conditional source choice only if that tradeoff is desired**; do not approve production adoption on today's evidence. Retaining SOI pending permission remains reasonable. No numeric operational buffer is proposed: the evaluated 10/100/1,000 m values are sensitivity probes, not defensible error bounds. Weakening “validated accuracy” to “arbitrary operational buffer” would change the substance of the endpoint-inside-Maharashtra promise and is not recommended here.

The precise remaining blocker after source approval is a defensible uncertainty/completeness assessment for this artifact, followed by the still-required actual-artifact integration and authenticated tests. Source approval alone cannot remove that blocker. No evidence has been moved into another ticket.
