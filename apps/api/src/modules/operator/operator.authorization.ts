import type { PoolClient } from "pg";
import { AppError } from "../../shared/errors/app-error";
import { operatorQuery } from "./operator.repo";

// Protected services call this inside their business transaction, after HTTP session/MFA checks.
export async function assertCurrentOperator(client: PoolClient, operatorId: string) {
  const result = await operatorQuery(client, "currentOperator", [operatorId]);
  if (!result.rowCount) throw new AppError(403, "Operator access has been revoked", "OPERATOR_ACCESS_REVOKED");
}
