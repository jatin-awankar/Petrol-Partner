# Ticket 04 boundary and policy evidence — 2026-10-03

This records read-only research and engineering choices, not launch approval. No data was migrated or deleted, no contact was sent, and no purchase or deployment occurred. Real bookings remain disabled.

## Boundary source

The [Survey of India ABDB page](https://surveyofindia.gov.in/pages/administrative-boundary-data-base-abdb-) links [state/district/subdistrict geometry](https://surveyofindia.gov.in/documents/State_District_Subdistrict_PAN%20INDIA.rar) and [metadata](https://surveyofindia.gov.in/documents/Metadata_ABDB.zip). Metadata ZIP SHA-256: `1a14716b73f00fc8391f2708a7975c2f2c1ad4a4e91aafb6dce6546a039e9514`.

`STATE BOUNDARY.xlsx` identifies `SOI/ABDB/VECTOR/50000/2025/STATE/INDIA`, metadata date 2026-05-06, 1:50,000 source mapping, LCC–WGS84 / EPSG7755 and horizontal RMSE ±12.5 m. It describes Maharashtra harmonization with ORGI in 2025. These are publisher claims, not our geometry validation. RMSE is not a guaranteed maximum error. The older [product listing](https://onlinemaps.surveyofindia.gov.in/Digital_Products.aspx) describes ₹0, 1:1 million shapefiles; do not conflate the editions.

The geometry HTTP header reported 202,524,438 bytes, last modified 2026-05-12. Download terminated early with curl error 18; no complete geometry checksum, topology, attribute or transformation validation is available. The partial temporary archive is not a usable source artifact and must not be imported.

## Reuse evidence

The [published geospatial guidelines](https://onlinemaps.surveyofindia.gov.in/GeospatialGuidelines.aspx), clause 4(xiii), identify SOI boundaries as the political-map standard and permit digital display and printing. The [website copyright policy](https://surveyofindia.gov.in/pages/copyright-policy) requires written permission for reproduction. Metadata refers to the guidelines and copyright. Applicability to this exact downloadable artifact and server-side derived geometry remains unreconciled; neither the ₹0 listing nor accessibility alone establishes all reuse rights. No permission request was sent. Retain this blocker rather than assert a legal conclusion.

## Existing operational evidence

- The 2026-09-29 tests of `jatinawankar23@gmail.com` and `supportpp@gmail.com` remain maintainer-attested receipt and personal acknowledgement at approximately 15:00 IST. They do not prove an independent failure domain, continuous coverage, response-time targets or backup staffing.
- [Ticket 05](../../../.scratch/unrestricted-booking/issues/05-inventory-deployed-data-and-plan-migration.md) records a dated database/Auth inventory with zero application and Auth users in its confirmed target. It does not inventory every external copy or authorize deletion of historical projects.
- [Account closure](../account-closure-retention.md) lacks a provider deletion runner and restore-safe independent deletion manifest. [Backup evidence](ticket11-synthetic-backup-restore-2026-09-25.md) covers a synthetic lifecycle only; it is not a real-data deletion guarantee.
- [Ticket 02 Answer](../../../.scratch/unrestricted-booking/issues/02-approve-route-and-contribution-rules.md#answer) selects Valhalla/OSM and transfers production evidence to named downstream tickets. Its resolution neither approves ticket 04 nor enables bookings.

## Human decisions and limits

On 2026-10-03 the maintainer approved the 15-minute urgent acknowledgement and one-business-day routine response targets, subject to rehearsal before launch. He approved drafting the 30/90-day retention schedule with 30-day hold reviews. He declined backup staffing because this is a personal project intended to be fully workable, rather than a full-time platform. No backup, independent channel, rehearsal or real-trip launch approval is inferred.

The engineering plan specifies source/provenance checks, response clocks, proposed finite provider/copy lifecycles, restore suppression and a conservative cumulative 5 km/10-minute outside-state limit. These are routine agent-selected requirements, not observed production behavior or external approval. Actual boundary geometry validation, reconciled reuse rights, provider-copy lifecycle, historical-payment retention and active-trip escalation remain incomplete. These findings initially kept ticket 04 unresolved. The later explicit maintainer-approved scope amendment resolves policy selection only and transfers these uncompleted requirements to named downstream tickets; none of the findings is thereby cured.

## Scope approval evidence

The agent proposed resolving ticket 04 as approved for implementation with the sole-operator model, existing commitments, selected boundary and retention schedule; assigning outstanding evidence to implementation/release tickets; and retaining independent active-trip escalation as a real-booking launch blocker. The maintainer replied “yes” and authorized the necessary dependent-ticket cross-references. Policy version `2026-10-03.2` and ticket 04 Answer record that decision. No new provider, geometry, staffing or deletion evidence was obtained by this approval.
