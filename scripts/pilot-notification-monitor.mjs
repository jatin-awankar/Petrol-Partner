import pg from 'pg';

export function monitorSignals({ now, windowStart, windowEnd, workerSeenAt, oldestReadyAt, queueSize }) {
  const active = Number.isFinite(Date.parse(windowStart)) && Number.isFinite(Date.parse(windowEnd)) &&
    now >= new Date(windowStart) && now < new Date(windowEnd);
  if (!Number.isFinite(Date.parse(windowStart)) || !Number.isFinite(Date.parse(windowEnd))) return ['operating_window_unconfigured'];
  if (new Date(windowEnd) <= new Date(windowStart)) return ['operating_window_invalid'];
  if (now >= new Date(windowEnd)) return ['operating_window_expired'];
  if (!active) return [];
  const signals = [];
  if (!workerSeenAt || now.getTime() - new Date(workerSeenAt).getTime() > 5 * 60_000)
    signals.push('worker_stalled');
  if (oldestReadyAt && now.getTime() - new Date(oldestReadyAt).getTime() > 5 * 60_000)
    signals.push('important_queue_stalled');
  if (queueSize >= 20) signals.push('important_queue_growth');
  return signals;
}

export async function runMonitor({ env = process.env, now = new Date(), query, send = fetch } = {}) {
  const endpoint = env.PILOT_OUTAGE_ALERT_ENDPOINT;
  if (!endpoint || new URL(endpoint).protocol !== 'https:' || !env.PILOT_OUTAGE_ALERT_TOKEN)
    throw new Error('Independent HTTPS outage alert channel is not configured');
  let signals;
  let queueSize = null;
  try {
    const result = await query(`SELECT
      (SELECT last_seen_at FROM pilot_email_worker_state WHERE singleton=true) AS worker_seen_at,
      (SELECT min(e.ready_at) FROM pilot_email_jobs j JOIN pilot_notification_events e ON e.id=j.event_id
        WHERE j.status IN ('pending','leased') AND e.ready_at IS NOT NULL) AS oldest_ready_at,
      (SELECT count(*)::int FROM pilot_email_jobs j JOIN pilot_notification_events e ON e.id=j.event_id
        WHERE j.status IN ('pending','leased') AND e.ready_at IS NOT NULL) AS queue_size`);
    const row = result.rows[0];
    queueSize = row.queue_size;
    signals = monitorSignals({now,windowStart:env.PILOT_SUPPORT_WINDOW_START,
      windowEnd:env.PILOT_SUPPORT_WINDOW_END,workerSeenAt:row.worker_seen_at,
      oldestReadyAt:row.oldest_ready_at,queueSize});
  } catch {
    signals = ['notification_database_unavailable'];
  }
  if (!signals.length) return { signals, queueSize };
  const response = await send(endpoint, {method:'POST',headers:{'Content-Type':'application/json',
    Authorization:`Bearer ${env.PILOT_OUTAGE_ALERT_TOKEN}`,
    'Idempotency-Key':`pilot-notification:${signals.join('+')}:${now.toISOString().slice(0,16)}`},
    body:JSON.stringify({source:'pilot-notification-monitor',signals,queueSize,observedAt:now.toISOString()}),
    signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Independent outage alert failed with HTTP ${response.status}`);
  return {signals,queueSize};
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const client = new pg.Client({connectionString:process.env.MONITOR_DATABASE_URL,
    connectionTimeoutMillis:5000,statement_timeout:5000});
  try {
    if (!process.env.MONITOR_DATABASE_URL) throw new Error('MONITOR_DATABASE_URL is required');
    const result = await runMonitor({query:async(sql)=>{await client.connect();return client.query(sql);}});
    console.log(JSON.stringify(result));
  } catch(error) { console.error(error instanceof Error ? error.message : 'Monitor failed'); process.exitCode=1; }
  finally { await client.end().catch(()=>undefined); }
}
