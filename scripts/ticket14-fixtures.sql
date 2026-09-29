-- Ticket 14: wholly synthetic historical rows. No deployed records or identifiers.
-- Fixture insertion bypasses live-use policy triggers; constraints and FKs remain checked.
SET session_replication_role = replica;
INSERT INTO users(id,email) VALUES
 ('00000000-0000-4000-8000-000000000001','synthetic-driver@example.test'),
 ('00000000-0000-4000-8000-000000000002','synthetic-passenger@example.test');
INSERT INTO user_profiles(user_id,full_name) VALUES
 ('00000000-0000-4000-8000-000000000001','Synthetic Driver'),
 ('00000000-0000-4000-8000-000000000002','Synthetic Passenger');
INSERT INTO auth_identities(provider,provider_subject,user_id,provider_email) VALUES
 ('supabase','synthetic-driver-subject','00000000-0000-4000-8000-000000000001','synthetic-driver@example.test'),
 ('supabase','synthetic-passenger-subject','00000000-0000-4000-8000-000000000002','synthetic-passenger@example.test');
INSERT INTO vehicles(id,owner_user_id,vehicle_type,registration_number_last4,seat_capacity,verification_status)
 VALUES ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','car','0001',3,'approved');
INSERT INTO ride_offers(id,driver_id,vehicle_id,pickup_location,pickup_lat,pickup_lng,drop_location,drop_lat,drop_lng,date,time,available_seats,price_per_seat_paise,status,pilot_policy_id,pilot_policy_snapshot,pilot_origin_code,pilot_destination_code,pilot_capacity,pilot_currency,pilot_request_cutoff_at,pilot_acceptance_cutoff_at,pilot_commitment_until)
 SELECT '30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Synthetic A',20,77,'Synthetic B',20.1,77.1,current_date+1,'09:00',2,2500,'active',id,'{"version":1,"currency":"INR"}','university','prmitr',2,'INR',now()+interval '1 hour',now()+interval '2 hours',now()+interval '1 day' FROM pilot_corridor_policies WHERE version=1;
INSERT INTO pilot_seat_requests(id,offer_id,passenger_id,driver_id,status,offer_version,offer_terms,decision_deadline_at)
 VALUES ('31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','accepted',1,'{"contribution_paise":2500,"currency":"INR","policy_version":1}',now()+interval '2 hours');
INSERT INTO pilot_seat_request_operations(id,actor_id,idempotency_key,payload_digest,request_id,action,result,request_snapshot,state)
 VALUES ('31100000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','synthetic-accept','digest','31000000-0000-4000-8000-000000000001','accepted','{}','{"policy_version":1,"contribution_paise":2500}','acknowledged');
INSERT INTO pilot_seat_request_audit(operation_id,request_id,actor_id,action)
 VALUES ('31100000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','accepted');
INSERT INTO pilot_seat_allocations(id,request_id,offer_id,driver_id,passenger_id,vehicle_id,contribution_paise,currency,offer_version,policy_version,departure_at,commitment_until)
 VALUES ('32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',2500,'INR',1,1,now()+interval '3 hours',now()+interval '4 hours');
INSERT INTO pilot_journey_operations(id,offer_id,allocation_id,actor_id,idempotency_key,payload_digest,kind,claims,recorded_at,state) VALUES
 ('33000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',NULL,'00000000-0000-4000-8000-000000000001','synthetic-driver','digest','driver_completion','{}',now(),'acknowledged'),
 ('33000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','synthetic-passenger','digest','passenger_confirmation','{}',now(),'acknowledged');
INSERT INTO pilot_contribution_obligations(id,allocation_id,driver_claim_operation_id,passenger_claim_operation_id,amount_paise,currency,policy_version,confirmed_at,due_at)
 VALUES ('34000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000002',2500,'INR',1,now(),now()+interval '24 hours');
INSERT INTO bookings(id,ride_offer_id,created_by_user_id,passenger_id,driver_id,seats_booked,total_amount_paise,platform_fee_paise,status,payment_state,confirmed_at)
 VALUES ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',1,12500,500,'confirmed','paid_escrow',now());
INSERT INTO payment_orders(id,booking_id,user_id,provider,provider_order_id,amount_paise,currency,status,idempotency_key)
 VALUES ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','historical-razorpay','synthetic-order',12500,'INR','paid','synthetic-key');
INSERT INTO payment_attempts(payment_order_id,provider_payment_id,status,raw_payload)
 VALUES ('50000000-0000-4000-8000-000000000001','synthetic-payment','captured','{}');
INSERT INTO payment_webhook_events(provider,provider_event_id,event_type,payload_hash,raw_body,processing_status)
 VALUES ('historical-razorpay','synthetic-event','payment.captured','synthetic-hash','{}','processed');
INSERT INTO booking_settlements(id,booking_id,payer_user_id,payee_user_id,ride_fare_paise,platform_fee_paise,total_due_paise,paid_amount_paise,preferred_payment_method,status)
 VALUES ('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',12000,500,12500,12500,'online','settled');
INSERT INTO settlement_events(settlement_id,booking_id,actor_user_id,event_type,next_status)
 VALUES ('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','synthetic-settled','settled');
SET session_replication_role = origin;
