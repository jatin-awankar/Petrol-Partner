import type { Pool } from "pg";
import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { B2ReceiptStore } from "../operator/b2-receipt-store";
import { operatorQuery } from "../operator/operator.repo";
import { SignedReceiptStore } from "../operator/receipt-store";
import { inProtectedTransaction } from "./protocol";

export function pilotReceiptStore<Receipt extends {operationId:string}>(name:"corridor-offer"|"seat-request",message:string) {
  const unavailable = () => new AppError(503,message,"RECOVERY_UNAVAILABLE");
  const secret = process.env.PILOT_RECEIPT_SECRET ?? env.PILOT_RECEIPT_SECRET;
  if (!secret || secret.length < 32) throw unavailable();
  if (env.PILOT_RECEIPT_BACKEND === "b2") {
    const { PILOT_B2_BUCKET:bucket,PILOT_B2_ENDPOINT:endpoint,PILOT_B2_WRITER_KEY_ID:keyId,
      PILOT_B2_WRITER_KEY:applicationKey,PILOT_B2_PREFIX:prefix,PILOT_B2_RETENTION_DAYS:retentionDays } = env;
    if (!bucket || !endpoint || !keyId || !applicationKey || !prefix || !retentionDays) throw unavailable();
    return new B2ReceiptStore<Receipt>({bucket,endpoint,keyId,applicationKey,prefix,retentionDays,secret},name);
  }
  const path = process.env.PILOT_RECEIPT_PATH ?? env.PILOT_RECEIPT_PATH;
  if (env.NODE_ENV === "production" || !path) throw unavailable();
  return new SignedReceiptStore<Receipt>(`${path}.${name}`,secret);
}

export async function restrictProtectedWrites(db:Pool,cause:string) {
  await inProtectedTransaction(db,async client => {
    await operatorQuery(client,"recoveryModeForUpdate");
    await operatorQuery(client,"enterRestrictedMode",[cause]);
    await operatorQuery(client,"recordRestriction",[cause]);
  });
}
