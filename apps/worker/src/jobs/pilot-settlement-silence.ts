import type {Pool} from 'pg';

// Due time is checked in PostgreSQL. A missed sweep is harmless and the unique case key makes retries safe.
export async function reviewSilentSettlements(database:Pool,now=new Date()){
  const client=await database.connect();
  try{
    await client.query('BEGIN');
    const state=(await client.query<{mode:string}>(`SELECT mode FROM pilot_recovery_state
      WHERE singleton=true FOR SHARE`)).rows[0];
    if(state?.mode!=='open'){await client.query('COMMIT');return {opened:0};}
    const due=(await client.query<{id:string;allocation_id:string;driver_id:string;passenger_id:string}>(`
      SELECT o.id,o.allocation_id,a.driver_id,a.passenger_id
      FROM pilot_contribution_obligations o JOIN pilot_seat_allocations a ON a.id=o.allocation_id
      JOIN pilot_settlement_operations c ON c.obligation_id=o.id AND c.kind='claim'
      WHERE c.recorded_at+interval '24 hours'<=$1
      AND NOT EXISTS(SELECT 1 FROM pilot_settlement_operations r WHERE r.obligation_id=o.id
        AND r.kind IN ('confirm','dispute'))
      AND NOT EXISTS(SELECT 1 FROM pilot_settlement_reviews v WHERE v.obligation_id=o.id)
      ORDER BY c.recorded_at,o.id LIMIT 100 FOR UPDATE OF o SKIP LOCKED`,[now])).rows;
    let opened=0;
    for(const row of due){
      const review=(await client.query<{id:string}>(`INSERT INTO pilot_settlement_reviews
        (obligation_id,reason,opened_at) VALUES($1,'driver_silence',$2)
        ON CONFLICT(obligation_id) DO NOTHING RETURNING id`,[row.id,now])).rows[0];
      if(!review) continue;
      opened++;
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,created_at)
        VALUES(NULL,'pilot_settlement_driver_silence','pilot_contribution_obligation',$1,
          jsonb_build_object('reviewId',$2::text),$3)`,[row.id,review.id,now]);
      const recipients=(await client.query<{id:string}>(`SELECT $1::uuid AS id UNION SELECT $2::uuid
        UNION SELECT user_id FROM operator_allowlist WHERE active=true`,[row.driver_id,row.passenger_id])).rows;
      for(const recipient of recipients){
        const event=(await client.query<{id:string}>(`INSERT INTO pilot_notification_events
          (origin_type,operation_id,recipient_id,event_type,related_entity_type,related_entity_id,title,body,ready_at)
          VALUES('pilot_settlement_silence',$1,$2,'settlement_review','pilot_contribution_obligation',$3,
            'Direct payment needs review','The driver did not respond to the payment claim within 24 hours.',now())
          ON CONFLICT(origin_type,operation_id,recipient_id,event_type)
          DO UPDATE SET operation_id=EXCLUDED.operation_id RETURNING id`,
          [review.id,recipient.id,row.id])).rows[0];
        await client.query(`INSERT INTO pilot_email_jobs(event_id,recipient_id) VALUES($1,$2)
          ON CONFLICT(event_id) DO NOTHING`,[event.id,recipient.id]);
      }
    }
    await client.query('COMMIT');return {opened};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
