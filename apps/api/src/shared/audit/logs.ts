import type { PoolClient } from "pg";

import { dbQuery } from "../../db/pool";

export async function insertAuditLog(
  input: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
  client?: PoolClient,
) {
  const queryText = `INSERT INTO audit_logs (
       actor_user_id,
       action,
       entity_type,
       entity_id,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5::jsonb)`;
  const params = [
    input.actorUserId ?? null,
    input.action,
    input.entityType,
    input.entityId,
    JSON.stringify(input.metadata ?? {}),
  ];

  if (client) {
    await client.query(queryText, params);
    return;
  }

  await dbQuery(queryText, params);
}
