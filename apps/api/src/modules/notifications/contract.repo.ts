import type { Pool, PoolClient } from "pg";

type Database = Pool | PoolClient;

export type DurableNotification = {
  originType: string;
  operationId: string;
  recipientId: string;
  eventType: string;
  relatedEntityType: string;
  relatedEntityId: string;
  title: string;
  body: string;
  eventId?: string;
};

// Call within the business transaction. Publication waits for recovery evidence.
export async function recordDurableNotification(database: Database, notification: DurableNotification): Promise<string> {
  const result = await database.query<{ id: string }>(
    `INSERT INTO pilot_notification_events
       (id, origin_type, operation_id, recipient_id, event_type, related_entity_type, related_entity_id, title, body)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (origin_type, operation_id, recipient_id, event_type)
     DO UPDATE SET operation_id = EXCLUDED.operation_id RETURNING id`,
    [notification.eventId ?? null, notification.originType, notification.operationId, notification.recipientId,
      notification.eventType, notification.relatedEntityType, notification.relatedEntityId, notification.title, notification.body],
  );
  const eventId = result.rows[0].id;
  await database.query(
    `INSERT INTO pilot_email_jobs (event_id, recipient_id) VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING`, [eventId, notification.recipientId],
  );
  return eventId;
}

export async function markDurableNotificationReady(database: Database, eventId: string) {
  await database.query("UPDATE pilot_notification_events SET ready_at = now() WHERE id = $1 AND ready_at IS NULL", [eventId]);
}
