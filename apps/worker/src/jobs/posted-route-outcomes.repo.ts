import type {PoolClient} from 'pg';
export type DueOutcome={id:string;offer_id:string;allocation_id:string|null;driver_id:string;
  passenger_id:string|null;due_at:Date;kind:string};
export async function dueOutcomes(db:PoolClient,at:Date){
  const delayed=(await db.query<DueOutcome>(`SELECT o.id,o.id AS offer_id,NULL::uuid AS allocation_id,
    o.driver_id,NULL::uuid AS passenger_id,o.departure_at+interval '30 minutes' AS due_at,
    'delayed_departure' AS kind FROM posted_route_offers o
    WHERE o.status IN ('prepared','held') AND o.departure_at+interval '30 minutes'<$1
    AND EXISTS(SELECT 1 FROM posted_route_operations p WHERE p.offer_id=o.id AND p.state IN ('acknowledged','recovered'))
    AND NOT EXISTS(SELECT 1 FROM posted_route_outcome_notices n WHERE n.entity_id=o.id AND n.kind='delayed_departure')
    ORDER BY o.id LIMIT 100 FOR UPDATE OF o`,[at])).rows;
  const journeys=(await db.query<DueOutcome>(`SELECT a.id,a.offer_id,a.id AS allocation_id,
    a.driver_id,a.passenger_id,min(p.created_at)+interval '24 hours' AS due_at,'journey_silence' AS kind
    FROM posted_route_seat_allocations a JOIN posted_route_offers o ON o.id=a.offer_id
    JOIN posted_route_journey_claims c ON c.allocation_id=a.id
    JOIN posted_route_outcome_operations p ON p.id=c.operation_id AND p.state IN ('acknowledged','recovered')
    WHERE o.status='departed' AND a.status='confirmed'
    AND NOT EXISTS(SELECT 1 FROM posted_route_obligations b WHERE b.allocation_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM posted_route_journey_reviews r WHERE r.allocation_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM posted_route_outcome_notices n WHERE n.entity_id=a.id AND n.kind='journey_silence')
    GROUP BY a.id HAVING min(p.created_at)+interval '24 hours'<=$1 LIMIT 100`,[at])).rows;
  const payments=(await db.query<DueOutcome>(`SELECT b.id,a.offer_id,a.id AS allocation_id,
    a.driver_id,a.passenger_id,b.due_at,'payment_overdue' AS kind FROM posted_route_obligations b
    JOIN posted_route_seat_allocations a ON a.id=b.allocation_id WHERE b.due_at<=$1
    AND NOT EXISTS(SELECT 1 FROM posted_route_payment_claims c WHERE c.obligation_id=b.id)
    AND NOT EXISTS(SELECT 1 FROM posted_route_outcome_notices n WHERE n.entity_id=b.id AND n.kind='payment_overdue')
    ORDER BY b.id LIMIT 100`,[at])).rows;
  const receipts=(await db.query<DueOutcome>(`SELECT c.id,a.offer_id,a.id AS allocation_id,
    a.driver_id,a.passenger_id,c.claimed_at+interval '24 hours' AS due_at,'receipt_silence' AS kind
    FROM posted_route_payment_claims c JOIN posted_route_obligations b ON b.id=c.obligation_id
    JOIN posted_route_seat_allocations a ON a.id=b.allocation_id
    WHERE c.claimed_at+interval '24 hours'<=$1
    AND NOT EXISTS(SELECT 1 FROM posted_route_receipt_decisions d WHERE d.claim_id=c.id)
    AND NOT EXISTS(SELECT 1 FROM posted_route_settlement_reviews r WHERE r.obligation_id=b.id)
    AND NOT EXISTS(SELECT 1 FROM posted_route_outcome_notices n WHERE n.entity_id=c.id AND n.kind='receipt_silence')
    ORDER BY c.id LIMIT 100`,[at])).rows;
  return [...delayed,...journeys,...payments,...receipts];
}
export async function recordOutcomeNotice(db:PoolClient,item:DueOutcome){
  const added=await db.query(`INSERT INTO posted_route_outcome_notices(entity_id,kind,due_at)
    VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING entity_id`,[item.id,item.kind,item.due_at]);
  if(!added.rowCount)return false;
  if(item.kind==='journey_silence')await db.query(`INSERT INTO posted_route_journey_reviews(allocation_id,reason)
    VALUES($1,'passenger_or_driver_silence') ON CONFLICT(allocation_id) DO NOTHING`,[item.allocation_id]);
  if(item.kind==='receipt_silence')await db.query(`INSERT INTO posted_route_settlement_reviews(obligation_id,reason)
    SELECT obligation_id,'recipient_silence' FROM posted_route_payment_claims WHERE id=$1
    ON CONFLICT(obligation_id) DO NOTHING`,[item.id]);
  await db.query(`INSERT INTO audit_logs(action,entity_type,entity_id,metadata)
    VALUES($1,'posted_route_offer',$2,jsonb_build_object('timerEntityId',$3::text,'dueAt',$4::text))`,
    [`posted_route_${item.kind}`,item.offer_id,item.id,item.due_at.toISOString()]);
  const recipients=(await db.query<{id:string}>(`SELECT $1::uuid AS id
    UNION SELECT passenger_id FROM posted_route_seat_allocations WHERE offer_id=$2
      AND status IN ('confirmed','held') AND ($3::uuid IS NULL OR id=$3)
    UNION SELECT a.user_id FROM operator_allowlist a JOIN users u ON u.id=a.user_id
      WHERE a.active=true AND u.status='active'`,[item.driver_id,item.offer_id,item.allocation_id])).rows;
  for(const {id} of recipients){
    const event=(await db.query<{id:string}>(`INSERT INTO pilot_notification_events
      (id,origin_type,operation_id,recipient_id,event_type,related_entity_type,related_entity_id,title,body,ready_at)
      VALUES(md5('posted-route-timer:'||$1::text||':'||$2::text||':'||$3)::uuid,
        'posted_route_timer',$1::uuid,$2::uuid,$3,'posted_route_offer',$4::uuid,'Route booking needs review',
        'A route booking deadline passed. Review the recorded facts; time alone does not establish travel or payment.',now())
      ON CONFLICT(origin_type,operation_id,recipient_id,event_type)
      DO UPDATE SET operation_id=EXCLUDED.operation_id RETURNING id`,[item.id,id,item.kind,item.offer_id])).rows[0];
    await db.query(`INSERT INTO pilot_email_jobs(event_id,recipient_id) VALUES($1,$2)
      ON CONFLICT(event_id) DO NOTHING`,[event.id,id]);
  }
  return true;
}

export async function lockOutcomeProduction(db:PoolClient){
  const state=(await db.query<{mode:string}>(
    'SELECT mode FROM pilot_recovery_state WHERE singleton=true FOR UPDATE')).rows[0];
  return state?.mode==='open'&&!(await db.query(`SELECT 1 FROM posted_route_outcome_operations
    WHERE state='committed' LIMIT 1`)).rowCount;
}
