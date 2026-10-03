-- Historical routes and signed snapshots keep their original terms. NULL means
-- no new verification evidence; it must never be interpreted as Valhalla proof.
ALTER TABLE posted_route_offers ADD COLUMN IF NOT EXISTS route_verification jsonb;
ALTER TABLE posted_route_offers DROP CONSTRAINT IF EXISTS posted_route_valhalla_evidence;
ALTER TABLE posted_route_offers ADD CONSTRAINT posted_route_valhalla_evidence
  CHECK (routing_source <> 'valhalla' OR
    (route_verification IS NOT NULL AND jsonb_typeof(route_verification)='object'
      AND route_verification ?& ARRAY['manifest','manifestDigest','costing','costingOptions',
        'normalizationVersion','edges','requested','routed','confirmation','boundary']));
