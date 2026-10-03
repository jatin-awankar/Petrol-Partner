# Ticket 02: TomTom synthetic route rehearsal (2026-09-28)

**Outcome:** TomTom Maps Routing API v1 returned usable synthetic car and motorcycle routes in India. This is technical evidence only; it does not approve a provider or enable real bookings.

## Conditions and results

- The TomTom account dashboard displayed **Freemium**. The API key was read from a Git-ignored local file; neither the key nor raw API responses were saved in this evidence.
- A public-location synthetic route near Amravati was requested with `car` and `motorcycle` travel modes. Each returned HTTP 200 and one route: 2,577 metres, 447 seconds, and 64 geometry points. Both modes returned the same geometry and summary on this single route; this does not establish mode-specific road restrictions.
- A second motorcycle request used `extendedRouteRepresentation=distance` and `sectionType=travelMode`. It returned HTTP 200, a progress interval from point 0 at 0 metres to point 63 at 2,577 metres, and a `TRAVEL_MODE` section identifying `motorcycle` for the full route.
- The initial sandboxed requests failed with local DNS `ENOTFOUND`; the same requests succeeded with network access. That local failure is not evidence of a TomTom outage.

The v1 API documents motorcycle mode as beta and describes its route geometry, distance progress, and mode sections. [TomTom Calculate Route v1](https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route)

## What this does not establish

- No scooter-specific response or road restriction accuracy was proven. A motorcycle response alone does not establish scooter coverage.
- No actual pickup/drop-off matching, correct-side safety check, ambiguity rejection, 50 km / 90 minute boundary, or accepted-contribution calculation ran against this response.
- Quota exhaustion was not induced. TomTom documents HTTP `429` after the free allowance is exceeded, but this rehearsal did not observe it. [TomTom platform FAQ](https://docs.tomtom.com/platform/documentation/status-and-support/faqs)
- The dashboard's **Freemium** label does not prove that no payment method is stored, that production use stays free, or that the plan will remain available.
- This rehearsal does not establish permission to retain route geometry and distance progression for booking/audit retention, to display the result over Mapbox, or to use the beta motorcycle mode for scooters in this booking product.

## Next evidence needed

1. Obtain the applicable TomTom licence text or written provider clarification for production ride-booking use, durable route-result retention (including geometry and distance progression), and display on the chosen map.
2. Confirm whether `motorcycle` covers the pilot's scooters and what limitations apply in India.
3. Rehearse local segment matching and fail-closed handling of a simulated or observed `429`, without exhausting the account's full monthly free allowance.
4. Confirm account billing configuration and measure request usage in the dashboard after its reporting delay.

Until these checks pass, the TomTom provider gate remains open for cars, bikes, and scooters.
