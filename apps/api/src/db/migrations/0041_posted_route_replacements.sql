-- A replacement has a new route identity; no request or allocation is copied.
ALTER TABLE posted_route_offers ADD COLUMN IF NOT EXISTS replaces_offer_id uuid REFERENCES posted_route_offers(id);
CREATE UNIQUE INDEX IF NOT EXISTS posted_route_one_replacement
  ON posted_route_offers(replaces_offer_id) WHERE replaces_offer_id IS NOT NULL;
