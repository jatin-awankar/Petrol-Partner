import pg from 'pg';
import { runMonitor } from './pilot-notification-monitor.mjs';

if (!process.env.MONITOR_DATABASE_URL) throw Error('MONITOR_DATABASE_URL is required');
const interval = process.env.TEST_DATABASE_DISPOSABLE === 'true'
  ? Number(process.env.PILOT_MONITOR_INTERVAL_MS ?? 60000) : 60000;
if (!Number.isSafeInteger(interval) || interval < 100 || interval > 60000)
  throw Error('Invalid notification monitor interval');
const database = new pg.Pool({connectionString:process.env.MONITOR_DATABASE_URL,
  max:1,connectionTimeoutMillis:5000,statement_timeout:5000});
let busy=false;
async function tick() {
  if(busy)return;
  busy=true;
  try {
    const result=await runMonitor({query:sql=>database.query(sql)});
    if(result.signals.length) console.log(JSON.stringify(result));
  } catch(error) {
    console.error(error instanceof Error?error.message:'Independent monitor failed');
    await shutdown(1);
  } finally {busy=false;}
}
const timer=setInterval(()=>void tick(),interval);
void tick();
async function shutdown(code=0){clearInterval(timer);await database.end();process.exit(code);}
process.on('SIGTERM',()=>void shutdown());
process.on('SIGINT',()=>void shutdown());
