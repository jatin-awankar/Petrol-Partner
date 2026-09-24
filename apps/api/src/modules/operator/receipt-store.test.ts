import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

import { SignedReceiptStore } from "./receipt-store";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

it("publishes one complete receipt under concurrent same-operation retries and ignores an orphan temporary file", async () => {
  const root = await mkdtemp(join(tmpdir(), "pilot-receipt-"));
  directories.push(root);
  const path = join(root, "receipts");
  const store = new SignedReceiptStore<{ operationId: string; decision: string }>(path, "test-secret");
  const receipt = { operationId: randomUUID(), decision: "paused" };
  await Promise.all([store.append(receipt), store.append(receipt)]);
  await writeFile(join(path, `${randomUUID()}.tmp`), "interrupted write");
  expect(await store.list()).toEqual([receipt]);
  expect((await readdir(path)).filter((name) => name.endsWith(".json"))).toHaveLength(1);
});

it("rejects a damaged published receipt instead of treating it as absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "pilot-receipt-"));
  directories.push(root);
  const path = join(root, "receipts");
  const store = new SignedReceiptStore<{ operationId: string; decision: string }>(path, "test-secret");
  const receipt = { operationId: randomUUID(), decision: "paused" };
  await store.append(receipt);
  await writeFile(join(path, `${receipt.operationId}.json`), "truncated");
  await expect(store.list()).rejects.toThrow();
});
