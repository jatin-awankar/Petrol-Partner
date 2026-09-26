// Shared predicate for current driver, student, car and association eligibility.
// Callers provide aliases s, u, d, a and v for the joined tables.
export const currentPilotEligibilityWhere = `
  u.email_verified_at IS NOT NULL AND u.status = 'active'
  AND s.status IN ('verified', 'revalidation_due')
  AND s.adult_eligible = true AND s.eligibility_ends_at > now()
  AND d.status = 'approved' AND d.license_expires_at > CURRENT_DATE
  AND d.review_after > CURRENT_DATE
  AND a.status = 'approved' AND a.review_after > CURRENT_DATE
  AND v.status = 'active' AND v.verification_status = 'approved'
  AND v.vehicle_type IN ('car', 'suv') AND v.use_category = 'private'
  AND v.applicable_document_required IS NOT NULL
  AND v.insurance_expires_at > CURRENT_DATE
  AND (v.registration_expires_at IS NULL OR v.registration_expires_at > CURRENT_DATE)
  AND v.review_after > CURRENT_DATE`;
