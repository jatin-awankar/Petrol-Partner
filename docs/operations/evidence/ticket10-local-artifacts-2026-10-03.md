# Ticket 10 local artifact inspection — 2026-10-03

Ticket 10 remains claimed. This extends the earlier [ticket 04 evidence](ticket04-boundary-and-policy-evidence-2026-10-03.md), which records an incomplete download. No deployed data, historical route terms or real-booking gates were changed. No SOI permission request was sent.

## SOI archive and geometry inspection

The complete [official ABDB archive](https://surveyofindia.gov.in/documents/State_District_Subdistrict_PAN%20INDIA.rar), linked from the [publisher's ABDB page](https://surveyofindia.gov.in/pages/administrative-boundary-data-base-abdb-), was downloaded to temporary local storage. Size: 202,524,438 bytes. SHA-256: `b8325e5d9dd0f04a6663d775363fe38cd2f23bd9dbae3fb7118b4e6e0ce0bcb7`. The [metadata ZIP](https://surveyofindia.gov.in/documents/Metadata_ABDB.zip) has SHA-256 `1a14716b73f00fc8391f2708a7975c2f2c1ad4a4e91aafb6dce6546a039e9514`.

`STATE BOUNDARY.xlsx` identifies `SOI/ABDB/VECTOR/50000/2025/STATE/INDIA` in B4, metadata date 2026-05-06 in B6, and horizontal RMSE ±12.5 m in B53. Access and use constraints B54–B55 both say copyright. B56 refers to the geospatial guidelines. The QGIS metadata contains no additional licence grant.

Read-only inspection used pyshp 2.3.1, Shapely 2.0.7 and pyproj 3.6.1. Of 40 source records, the selected record has `STATE=MAHARASHTRA`, `Country=India`, and both object IDs equal to 34. It is a valid MultiPolygon before and after transformation: 93 parts, two holes, 85,831 vertices. No simplification or topology repair was performed. WGS84 bounds are approximately 72.64199057–80.89768432 E and 15.60608518–22.03026937 N. Mumbai and Amravati test points are inside; Hyderabad is outside. These are inspection checks, not production containment tests.

The transformation used the actual `.prj` WKT with `always_xy=True`, not an assumed EPSG identifier. Its LCC standard parallels differ slightly from the EPSG7755 definition. Across all vertices, the maximum displacement between those transformations was 0.0313 m; maximum round-trip error using the actual WKT was below 0.00000001 m. Source component SHA-256 values:

- `.shp`: `602505cbaa149c3aef1701e8bc69cfbda7d8a73c2c2c4d891892bb67ba95b779`
- `.dbf`: `e6afe169ff7055d02471a6ddae6536bed4c1dfb02c50765c0166ca2eb9a17ea0`
- `.shx`: `c1edfa5638ec217291460d871db6ef0772b249c075ef6d4b06ae35f6bac127fc`
- `.prj`: `4e0115a1711327038fc52f74a11a80ee1c399c8d84e8f0e5f54bf00b9fd20f16`

The temporary unsimplified GeoJSON inspection output hashes to `a806c513d628cc7643ad6259f69d142913931c94c5866c66d0c05d11017e269f`. Neither the source geometry nor the derived geometry is committed or installed as an application artifact. Topology validity and round-trip accuracy do not establish boundary accuracy or reusable rights. The published RMSE is not a maximum error; no uncertainty band is approved by these checks.

## Exact reuse blocker and prepared request

The maintainer confirmed there is **no existing permission**. The [SOI website copyright policy](https://surveyofindia.gov.in/pages/copyright-policy) requires written permission for reproduction, while the [geospatial guidelines](https://onlinemaps.surveyofindia.gov.in/GeospatialGuidelines.aspx) discuss broader use and digital display/printing. Their applicability to this exact derived, server-side artifact has not been established. This is unresolved licence evidence, not a conclusion that all processing is legally prohibited. Public availability alone is not the required reusable-artifact evidence.

Prepared request, **not sent**, for the publisher's metadata contact `ngdc.soi@gov.in`:

> Please confirm the applicable licence or provide written permission for Petrol Partner to use SOI/ABDB/VECTOR/50000/2025/STATE/INDIA, metadata dated 2026-05-06. We need to retain the downloaded state boundary, extract Maharashtra, transform its supplied LCC–WGS84 coordinates to WGS84, and store that derived geometry in a private application deployment and backups for server-side point containment and route intersection checks. Please clarify whether distribution of the derived artifact with application source is permitted, any commercial-use restrictions, required attribution, update obligations and other conditions. We can retain the artifact privately if redistribution is not permitted. The archive SHA-256 is b8325e5d9dd0f04a6663d775363fe38cd2f23bd9dbae3fb7118b4e6e0ce0bcb7.

Once reuse evidence is available, ticket 10 still needs a pinned deployable artifact, a justified uncertainty band, requested/routed endpoint containment, boundary/holes/multipart/crossing tests and cumulative outside-state metres/time enforcement. No proportional time estimate is approved. Until then, confirmed preparation returns `BOUNDARY_UNAVAILABLE`. Ticket 16 retains production licence evidence; this inspection does not resolve it.

## Actual local Valhalla build

The local rehearsal uses the [official Valhalla scripted image](https://github.com/valhalla/valhalla/blob/master/docker/README.md), pinned to `ghcr.io/valhalla/valhalla-scripted@sha256:1bfd648c6140ed64d488eb1505bbff608749b39ea81be3f87d1220d253c200c0`. `/status` reports `3.9.0-53e00619f`. The input is [Geofabrik western-zone-261002.osm.pbf](https://download.geofabrik.de/asia/india/western-zone-261002.osm.pbf), dated 2026-10-02, 220,810,238 bytes. Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL; extract provided by Geofabrik.

Local build SHA-256 values:

- OSM extract: `33218f1796d7d7b44e759403d12cc51b46d9e1debdb1ad7477f2360208bb95b7`
- `valhalla_tiles.tar`: `5fae44074a40b2bef27fd4adf9360bf2f46d7343053bbfd9bd548df9f4b0ee40`
- `admins.sqlite`: `16573d861401d27c9a784fba70457f33eedeb921556a52649ef7b3d9804db725`
- `valhalla.json`: `3c480f41c0f0d07e596463f633d92b6198aa82d9dbb6c268c2f3e824acdcc5e4`
- Graph bundle: `b3b9e359de8bcd87596671ea210cd4d313b497cd71938dc904e8cb6b1c4c6635`, SHA-256 of compact JSON with keys `valhalla_tiles.tar` then `admins.sqlite` and the above values.

The build generated 928 tiles with two threads, no timezone build and no default-speeds override. The serving container has a read-only root and read-only graph mount, a temporary `/tmp`, and loopback port 18002 only. It is a disposable compatibility rehearsal, not a reliable production host, road-legality certification or deployed gateway.

The scripted build used `server_threads=2`, `serve_tiles=False`, `build_time_zones=False` and `use_default_speeds_config=False`, with the downloaded extract in a private `/custom_files` bind mount. Serving used `/usr/local/bin/valhalla_service /custom_files/valhalla.json 2`, two CPUs, 2 GiB memory, `--read-only`, `--tmpfs /tmp:rw`, a read-only `/custom_files` mount and `127.0.0.1:18002:8002`. The build container was separate from the serving container. Rebuilding may change binary artifact hashes; recompute them rather than reusing this manifest blindly.

The opt-in HTTP/PostgreSQL tests use unchanged real `/route`, `/trace_attributes` and `/locate` bodies. A test-only fetch wrapper adds the build header after checking the engine version against the locally inventoried manifest. **This does not test a production build-attesting gateway or independently verify a remote server's graph.** Missing and mismatched header behavior remains covered by controlled failure tests. No actual boundary fixture is substituted in the live rehearsal: confirmed publication must fail closed.

To rerun against this inventoried local build and a disposable PostgreSQL database:

```sh
VALHALLA_REHEARSAL_URL=http://127.0.0.1:18002/ \
VALHALLA_REHEARSAL_MANIFEST="$PWD/docs/operations/evidence/ticket10-local-valhalla-manifest-2026-10-03.json" \
npm --workspace @petrol-partner/api run test:integration -- --testNamePattern='rehearses actual local'
```

Temporary local artifacts are under `/private/tmp/petrol-ticket10-evidence`; they are not durable release evidence. The [recorded manifest](ticket10-local-valhalla-manifest-2026-10-03.json) follows the [adapter contract](../valhalla-route-preparation.md). A rebuilt graph requires fresh hashes and a fresh manifest. Hosting, staging, actual road restrictions, deployed outage/rebuild tests, external review and real-booking approval remain with their existing tickets.

The first rehearsal used a rounded road-centre point that produced Valhalla warning 215 (side/heading filter fallback), so the fail-closed adapter rejected it. Correct-side selections approximately five metres east were used for the success cases; the original point remains a rejection case. The provider contract and production checks were not loosened. The targeted authenticated run passed all three mode cases.

Final continuation validation: `npm test` with the opt-in local Valhalla environment passed **38 script checks, 382 API tests (including all 183 authenticated HTTP/PostgreSQL cases), and 19 worker tests**; ten script checks and one unrelated API live-provider check were skipped. Root typechecking, API build and whitespace checks passed; lint passed with nine pre-existing warnings. The preceding full run encountered one `ECONNRESET` in an existing acceptance test; that case passed in isolation and the complete final rerun exited zero. Standards and Spec continuation reviews each reported zero actionable findings. The reviewers inspected code/evidence but did not independently reproduce the artifact build. Ticket 10 remains claimed and real bookings remain disabled.

After verification, the three disposable build/serving/PostgreSQL containers and the test database volume were removed. Temporary downloaded artifacts and diagnostic logs remain outside the repository; no local provider is left running.
