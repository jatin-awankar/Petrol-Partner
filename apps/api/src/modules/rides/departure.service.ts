import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { B2ReceiptStore } from "../operator/b2-receipt-store";
import { SignedReceiptStore } from "../operator/receipt-store";
import { backupStatus } from "../operator/backup-status";
import { operatorQuery } from "../operator/operator.repo";
import { assertCurrentOperator } from "../operator/operator.authorization";
import { inProtectedTransaction } from "../protected-mutation/protocol";
import { recordDurableNotification } from "../notifications/contract.repo";
import { assertCurrentDriverCarEligibility } from "../verification/verification.service";
import * as repo from "./departure.repo";

type Receipt = { operationId: string; rideId: string; driverId: string; key: string;
  digest: string; boardedIds: string[]; confirmedIds: string[]; startedAt: string };

function receipt(row: repo.DepartureOperation): Receipt {
  return { operationId: row.id, rideId: row.ride_offer_id, driverId: row.driver_user_id,
    key: row.idempotency_key, digest: row.payload_digest,
    boardedIds: row.boarded_booking_ids, confirmedIds: row.confirmed_booking_ids,
    startedAt: row.started_at.toISOString() };
}

function store() {
  const secret = process.env.PILOT_RECEIPT_SECRET ?? env.PILOT_RECEIPT_SECRET;
  if (!secret || secret.length < 32) throw new AppError(503, "Departure recovery evidence unavailable", "RECOVERY_UNAVAILABLE");
  if (env.PILOT_RECEIPT_BACKEND === "b2") {
    const { PILOT_B2_BUCKET: bucket, PILOT_B2_ENDPOINT: endpoint, PILOT_B2_WRITER_KEY_ID: keyId,
      PILOT_B2_WRITER_KEY: applicationKey, PILOT_B2_PREFIX: prefix,
      PILOT_B2_RETENTION_DAYS: retentionDays } = env;
    if (!bucket || !endpoint || !keyId || !applicationKey || !prefix || !retentionDays) {
      throw new AppError(503, "Departure recovery evidence unavailable", "RECOVERY_UNAVAILABLE");
    }
    return new B2ReceiptStore<Receipt>({ bucket, endpoint, keyId, applicationKey,
      prefix, retentionDays, secret }, "ride-departure");
  }
  const path = process.env.PILOT_RECEIPT_PATH ?? env.PILOT_RECEIPT_PATH;
  if (env.NODE_ENV === "production" || !path) {
    throw new AppError(503, "Departure recovery evidence unavailable", "RECOVERY_UNAVAILABLE");
  }
  return new SignedReceiptStore<Receipt>(`${path}.ride-departure`, secret);
}

async function restrict(database: Pool, cause: string) {
  await inProtectedTransaction(database, async (client) => {
    await operatorQuery(client, "recoveryModeForUpdate");
    await operatorQuery(client, "enterRestrictedMode", [cause]);
    await operatorQuery(client, "recordRestriction", [cause]);
  });
}

function digest(rideId: string, boardedIds: string[]) {
  return createHash("sha256").update(JSON.stringify({ rideId, boardedIds })).digest("hex");
}

function publicResult(row: repo.DepartureOperation) {
  return { operation_id: row.id, ride_offer_id: row.ride_offer_id,
    state: row.state, boarded_booking_ids: row.boarded_booking_ids,
    started_at: row.started_at.toISOString() };
}

export class DepartureService {
  constructor(private readonly database: Pool = pool) {}

  async receipts() { return store().list(); }

  async verifyEvidence(retry?: { driverId: string; key: string }) {
    try {
      const backup = await backupStatus(this.database);
      if (backup.required && !backup.healthy) throw new AppError(503, "Database backup is stale", "BACKUP_STALE");
      const receipts = new Map((await this.receipts()).map((item) => [item.operationId, item]));
      for (const item of receipts.values()) {
        if (item.digest !== digest(item.rideId, item.boardedIds)) {
          throw new AppError(503, "Departure receipt is inconsistent", "RECOVERY_CONFLICT");
        }
      }
      for (const row of await repo.acknowledged(this.database)) {
        if (JSON.stringify(receipts.get(row.id)) !== JSON.stringify(receipt(row))) {
          throw new AppError(503, "Departure recovery evidence is missing", "RECOVERY_MISSING");
        }
      }
      const pending = await repo.pending(this.database);
      if (pending.length && (!retry || pending.some((row) =>
        row.driver_user_id !== retry.driverId || row.idempotency_key !== retry.key))) {
        throw new AppError(503, "Departure awaits recovery evidence", "OPERATION_PENDING",
          { operationId: pending[0].id });
      }
    } catch (error) {
      await restrict(this.database, "ride_departure_evidence_unavailable");
      throw error;
    }
  }

  async reconcileReceipts(operatorId: string) {
    const items = await this.receipts();
    for (const item of items.sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
      if (item.digest !== digest(item.rideId, item.boardedIds)) {
        throw new AppError(409, "Departure receipt is inconsistent", "RECOVERY_CONFLICT");
      }
      await inProtectedTransaction(this.database, async (client) => {
        await assertCurrentOperator(client, operatorId);
        try { await repo.restore(client, item); }
        catch { throw new AppError(409, "Departure requires manual recovery", "RECOVERY_INCOMPLETE"); }
        const bookings = await repo.confirmedBookingsForUpdate(client, item.rideId);
        for (const recipientId of new Set([item.driverId, ...bookings.map((row) => row.passenger_id)])) {
          await recordDurableNotification(client, { originType: "ride_departure", operationId: item.operationId,
            recipientId, eventType: "ride_departed", relatedEntityType: "ride_offer",
            relatedEntityId: item.rideId, title: "Ride departed",
            body: "The ride has started. Boarding is recorded in the trip details." });
        }
        await client.query("UPDATE pilot_notification_events SET ready_at = now() WHERE origin_type = 'ride_departure' AND operation_id = $1", [item.operationId]);
        await client.query(`UPDATE pilot_email_jobs SET status = 'exhausted', lease_until = NULL,
          last_error = 'Suppressed after snapshot restore; delivery outcome requires review', updated_at = now()
          WHERE event_id IN (SELECT id FROM pilot_notification_events
            WHERE origin_type = 'ride_departure' AND operation_id = $1) AND status <> 'sent'`,
          [item.operationId]);
      });
    }
    return items.length;
  }

  async start(driverId: string, key: string, rideId: string, boardedIds: string[], now = new Date()) {
    const sorted = [...boardedIds].sort();
    if (new Set(sorted).size !== sorted.length) throw new AppError(400, "Duplicate boarding IDs", "BOARDING_INVALID");
    await this.verifyEvidence({ driverId, key });
    const payloadDigest = digest(rideId, sorted);
    const operation = await inProtectedTransaction(this.database, async (client) => {
      const recovery = await operatorQuery<{ mode: string }>(client, "recoveryModeForUpdate");
      await operatorQuery(client, "lockIdempotencyKey", [`departure:${driverId}:${key}`]);
      const prior = await repo.byKey(client, driverId, key);
      if (prior) {
        if (prior.payload_digest !== payloadDigest) throw new AppError(409,
          "Idempotency key used with another departure", "IDEMPOTENCY_PAYLOAD_MISMATCH");
        return prior;
      }
      if (recovery.rows[0]?.mode !== "open") throw new AppError(503, "Protected writes are restricted", "RECOVERY_RESTRICTED");
      store();
      const offer = await repo.offerForUpdate(client, rideId);
      if (!offer) throw new AppError(404, "Ride offer not found", "RIDE_NOT_FOUND");
      if (offer.driver_id !== driverId) throw new AppError(403, "Only the driver can depart", "FORBIDDEN");
      if (offer.status !== "active" || !offer.vehicle_id) throw new AppError(409,
        "Ride is not eligible to depart", "DEPARTURE_INVALID");
      const departure = new Date(`${offer.date}T${String(offer.time).slice(0, 8)}+05:30`);
      if (now.getTime() < departure.getTime() - 15 * 60_000 ||
          now.getTime() > departure.getTime() + 30 * 60_000) {
        throw new AppError(409, "Departure is outside the allowed window", "DEPARTURE_WINDOW_CLOSED");
      }
      await assertCurrentDriverCarEligibility(client, driverId, offer.vehicle_id);
      const bookings = await repo.confirmedBookingsForUpdate(client, rideId);
      const confirmed = new Set(bookings.map((item) => item.id));
      if (sorted.some((id) => !confirmed.has(id))) throw new AppError(409,
        "Boarding must identify confirmed passengers", "BOARDING_INVALID");
      const row = await repo.record(client, { rideId, driverId, key, digest: payloadDigest,
        boardedIds: sorted, confirmedIds: bookings.map((item) => item.id).sort(), now });
      for (const recipientId of new Set([driverId, ...bookings.map((item) => item.passenger_id)])) {
        await recordDurableNotification(client, { originType: "ride_departure", operationId: row.id,
          recipientId, eventType: "ride_departed", relatedEntityType: "ride_offer",
          relatedEntityId: rideId, title: "Ride departed",
          body: "The ride has started. Boarding is recorded in the trip details." });
      }
      return row;
    });
    if (operation.state !== "committed") return publicResult(operation);
    try {
      const result = await inProtectedTransaction(this.database, async (client) => {
        const row = await repo.byId(client, operation.id, true);
        if (!row) throw new AppError(503, "Departure operation is missing", "RECOVERY_MISSING");
        if (row.state !== "committed") return row;
        await store().append(receipt(row));
        const backup = await backupStatus(client);
        if (backup.required && !backup.healthy) throw new AppError(503, "Database backup is stale", "BACKUP_STALE");
        const saved = await repo.acknowledge(client, row.id);
        if (!saved) throw new AppError(503, "Departure acknowledgement failed", "RECOVERY_INCOMPLETE");
        await client.query("UPDATE pilot_notification_events SET ready_at = now() WHERE origin_type = 'ride_departure' AND operation_id = $1", [row.id]);
        return saved;
      });
      return publicResult(result);
    } catch {
      await restrict(this.database, "ride_departure_evidence_pending");
      throw new AppError(503, "Departure committed; recovery evidence is pending", "OPERATION_PENDING",
        { operationId: operation.id });
    }
  }
}

export const departureService = new DepartureService();
