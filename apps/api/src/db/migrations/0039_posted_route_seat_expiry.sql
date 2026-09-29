-- Keep committed seat history intact while adding the deadline outcome.
ALTER TABLE posted_route_seat_requests DROP CONSTRAINT posted_route_seat_requests_status_check;
ALTER TABLE posted_route_seat_requests ADD CONSTRAINT posted_route_seat_requests_status_check
  CHECK (status IN ('pending','accepted','rejected','withdrawn','expired'));
