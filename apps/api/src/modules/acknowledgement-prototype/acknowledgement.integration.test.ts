import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAcknowledgementPrototypeApp } from "./acknowledgement.app";

const databaseUrl = process.env.DATABASE_URL!;
const verificationPool = new Pool({ connectionString: databaseUrl, max: 2 });
let receiptPath: string;
const apps: Array<ReturnType<typeof createAcknowledgementPrototypeApp>> = [];

function createPrototypeApp(options: Partial<Parameters<typeof createAcknowledgementPrototypeApp>[0]> = {}) {
  const app = createAcknowledgementPrototypeApp({ databaseUrl, receiptPath, ...options });
  apps.push(app);
  return app;
}

beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "petrol-partner-ack-"));
  receiptPath = join(directory, "receipts.jsonl");
  const migration = await readFile(join(import.meta.dirname, "../../db/migrations/0004_acknowledgement_prototype.sql"), "utf8");
  await verificationPool.query(migration);
});

beforeEach(async () => {
  await writeFile(receiptPath, "", { mode: 0o600 });
  await verificationPool.query("TRUNCATE acknowledgement_operations, synthetic_actions, acknowledgement_notifications, acknowledgement_audit CASCADE");
  await verificationPool.query("UPDATE acknowledgement_system_state SET mode = 'open', reason = NULL, restricted_since = NULL, reopened_at = NULL WHERE singleton = true");
});

afterAll(async () => {
  await Promise.all(apps.map((app) => app.locals.close()));
  await verificationPool.end();
});

describe("acknowledgement recovery prototype HTTP seam", () => {
  it("publishes success only after a durable independent receipt and resolves an identical retry", async () => {
    const app = createPrototypeApp();
    const action = { subject: "synthetic-counter", delta: 3 };

    const first = await request(app)
      .post("/prototype/actions")
      .set("Idempotency-Key", "stable-key-1")
      .set("Idempotency-Scope", "student-17")
      .send(action);
    const retry = await request(app)
      .post("/prototype/actions")
      .set("Idempotency-Key", "stable-key-1")
      .set("Idempotency-Scope", "student-17")
      .send(action);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(first.body.operation).toMatchObject({ state: "acknowledged", result: { value: 3 } });

    const receipt = JSON.parse((await readFile(receiptPath, "utf8")).trim());
    expect(receipt).toMatchObject({
      operationId: first.body.operation.id,
      scope: "student-17",
      idempotencyKey: "stable-key-1",
      result: { value: 3 },
    });

    const persisted = await verificationPool.query(
      "SELECT state, payload_digest FROM acknowledgement_operations WHERE id = $1",
      [first.body.operation.id],
    );
    expect(persisted.rows).toEqual([
      expect.objectContaining({ state: "acknowledged", payload_digest: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]);
  });

  it("rejects changed-payload key reuse and makes acknowledged reads visible", async () => {
    const app = createPrototypeApp();
    const first = await request(app).post("/prototype/actions")
      .set("Idempotency-Key", "payload-key").set("Idempotency-Scope", "scope-a")
      .send({ subject: "counter-a", delta: 2 });
    const changed = await request(app).post("/prototype/actions")
      .set("Idempotency-Key", "payload-key").set("Idempotency-Scope", "scope-a")
      .send({ subject: "counter-a", delta: 4 });
    const visible = await request(app).get("/prototype/subjects/counter-a");

    expect(first.status).toBe(201);
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");
    expect(visible.body).toEqual({ subject: "counter-a", value: 2 });
  });

  it("leaves no intent when the process stops before intent persistence", async () => {
    const app = createPrototypeApp({ crash(point) { if (point === "before_intent") throw new Error("simulated_crash:before_intent"); } });
    const response = await request(app).post("/prototype/actions")
      .set("Idempotency-Key", "before-intent").set("Idempotency-Scope", "crash-scope")
      .send({ subject: "before-intent-counter", delta: 1 });
    const operations = await verificationPool.query("SELECT count(*)::integer AS count FROM acknowledgement_operations");
    expect(response.status).toBe(500);
    expect(operations.rows).toEqual([{ count: 0 }]);
  });

  for (const crashPoint of ["after_intent", "after_db_commit", "after_receipt", "after_publication"] as const) {
    it(`recovers a stopped process at ${crashPoint} without duplicating the action`, async () => {
      let shouldCrash = true;
      const crashing = createPrototypeApp({
        crash(point) {
          if (shouldCrash && point === crashPoint) {
            shouldCrash = false;
            throw new Error(`simulated_crash:${point}`);
          }
        },
      });
      const headers = { "Idempotency-Key": `crash-${crashPoint}`, "Idempotency-Scope": "process-restart" };
      const payload = { subject: `counter-${crashPoint}`, delta: 5 };
      const lost = await request(crashing).post("/prototype/actions").set(headers).send(payload);

      expect(lost.status).toBe(500);
      const restarted = createPrototypeApp();
      const retry = await request(restarted).post("/prototype/actions").set(headers).send(payload);
      expect(retry.status).toBe(200);
      expect(retry.body.operation).toMatchObject({ state: "acknowledged", result: { value: 5 } });

      const effects = await verificationPool.query(
        "SELECT count(*)::integer AS count FROM synthetic_actions WHERE subject = $1",
        [payload.subject],
      );
      expect(effects.rows).toEqual([{ count: 1 }]);
    });
  }

  it("keeps a committed result pending and blocks reads, writes, and notifications before evidence", async () => {
    let crashedOperationId: string | undefined;
    const app = createPrototypeApp({
      crash(point, operationId) {
        if (point === "after_db_commit" && !crashedOperationId) {
          crashedOperationId = operationId;
          throw new Error("simulated_timeout_after_commit");
        }
      },
    });
    await request(app).post("/prototype/actions")
      .set("Idempotency-Key", "pending-key").set("Idempotency-Scope", "pending-scope")
      .send({ subject: "pending-counter", delta: 7 });

    const status = await request(app).get(`/prototype/operations/${crashedOperationId}`);
    const hiddenRead = await request(app).get("/prototype/subjects/pending-counter");
    const blockedWrite = await request(app).post("/prototype/actions")
      .set("Idempotency-Key", "later-key").set("Idempotency-Scope", "later-scope")
      .send({ subject: "later-counter", delta: 1 });
    const notifications = await verificationPool.query("SELECT count(*)::integer AS count FROM acknowledgement_notifications");

    expect(status.body.operation).toEqual({ id: crashedOperationId, state: "pending_unknown", result: null });
    expect(hiddenRead.status).toBe(503);
    expect(blockedWrite.status).toBe(503);
    expect(notifications.rows).toEqual([{ count: 0 }]);
  });

  it("enters restricted mode on evidence failure and lets only the same operation recover after restart", async () => {
    const directoryAsReceipt = await mkdtemp(join(tmpdir(), "petrol-partner-bad-receipt-"));
    const failing = createPrototypeApp({ receiptPath: directoryAsReceipt });
    const headers = { "Idempotency-Key": "evidence-failure", "Idempotency-Scope": "restricted-scope" };
    const payload = { subject: "restricted-counter", delta: 9 };
    const pending = await request(failing).post("/prototype/actions").set(headers).send(payload);
    expect(pending.status).toBe(503);
    expect(pending.body.error.code).toBe("ACKNOWLEDGEMENT_PENDING");

    const status = await request(failing).get("/prototype/system-status");
    const bypass = await request(failing).post("/prototype/actions")
      .set("Idempotency-Key", "bypass").set("Idempotency-Scope", "other")
      .send({ subject: "other", delta: 1 });
    expect(status.body).toMatchObject({ mode: "restricted" });
    expect(bypass.body.error.code).toBe("ACKNOWLEDGEMENT_RESTRICTED");

    const restarted = createPrototypeApp();
    const recovered = await request(restarted).post("/prototype/actions").set(headers).send(payload);
    expect(recovered.status).toBe(200);
    const stillRestricted = await request(restarted).get("/prototype/subjects/restricted-counter");
    expect(stillRestricted.status).toBe(503);

    const reopened = await request(restarted).post("/prototype/recovery/reopen")
      .set("Recovery-Operator-Token", "prototype-operator-token")
      .send({ decision: "receipt verified and predecessor resolved" });
    expect(reopened.body).toMatchObject({ mode: "open", reason: "operator_decision:receipt verified and predecessor resolved" });
  });

  it("recovers every acknowledged action after an older snapshot restore without repeating effects or current clock rules", async () => {
    const app = createPrototypeApp();
    const created = await request(app).post("/prototype/actions")
      .set("Idempotency-Key", "after-snapshot").set("Idempotency-Scope", "restore-scope")
      .send({ subject: "restore-counter", delta: 11 });
    const original = await verificationPool.query("SELECT created_at FROM synthetic_actions WHERE operation_id = $1", [created.body.operation.id]);

    await verificationPool.query("TRUNCATE acknowledgement_operations CASCADE");
    const reconciled = await request(app).post("/prototype/recovery/reconcile")
      .set("Recovery-Operator-Token", "prototype-operator-token").send();
    const repeated = await request(app).post("/prototype/recovery/reconcile")
      .set("Recovery-Operator-Token", "prototype-operator-token").send();
    const restored = await verificationPool.query(
      "SELECT resulting_value, external_effect_key, created_at FROM synthetic_actions WHERE operation_id = $1",
      [created.body.operation.id],
    );

    expect(reconciled.body).toEqual({ recovered: [created.body.operation.id], mode: "restricted" });
    expect(repeated.body).toEqual({ recovered: [], mode: "restricted" });
    expect(restored.rows).toEqual([{
      resulting_value: 11,
      external_effect_key: created.body.operation.id,
      created_at: original.rows[0].created_at,
    }]);
    const reopened = await request(app).post("/prototype/recovery/reopen")
      .set("Recovery-Operator-Token", "prototype-operator-token")
      .send({ decision: "all independent receipts reconciled" });
    expect(reopened.body.mode).toBe("open");
  });

  it("serializes the same operation across two API instances", async () => {
    const firstInstance = createPrototypeApp();
    const secondInstance = createPrototypeApp();
    const send = (app: ReturnType<typeof createAcknowledgementPrototypeApp>) => request(app)
      .post("/prototype/actions")
      .set("Idempotency-Key", "multi-instance").set("Idempotency-Scope", "shared-scope")
      .send({ subject: "shared-counter", delta: 13 });
    const responses = await Promise.all([send(firstInstance), send(secondInstance)]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(responses[0].body).toEqual(responses[1].body);
    const effects = await verificationPool.query("SELECT count(*)::integer AS count, sum(delta)::integer AS total FROM synthetic_actions");
    expect(effects.rows).toEqual([{ count: 1, total: 13 }]);
  });
});
