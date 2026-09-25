import { randomUUID } from "node:crypto";
import {
  GetObjectCommand, GetObjectRetentionCommand, ListObjectVersionsCommand,
  PutObjectCommand, type S3Client,
} from "@aws-sdk/client-s3";
import { expect, it } from "vitest";
import { B2ReceiptStore, type B2ReceiptConfig } from "./b2-receipt-store";

const config: B2ReceiptConfig = {
  endpoint: "https://s3.us-east-005.backblazeb2.com", bucket: "synthetic-bucket",
  keyId: "synthetic-id", applicationKey: "synthetic-key", prefix: "synthetic/ticket09",
  retentionDays: 1, secret: "synthetic-independent-signing-secret-32",
};

type Version = { key: string; id: string; body: Buffer; modified: Date; until: Date; encrypted: boolean };
function fixture() {
  const versions: Version[] = [];
  let deleted = false;
  let unavailable = false;
  let shortenUpload = false;
  let losePutResponse = false;
  const client = {
    async send(command: unknown) {
      if (unavailable) throw new Error("provider unavailable");
      if (command instanceof ListObjectVersionsCommand) {
        const matching = versions.filter((version) => version.key.startsWith(command.input.Prefix ?? ""));
        const offset = command.input.VersionIdMarker ? matching.findIndex((version) => version.id === command.input.VersionIdMarker) + 1 : 0;
        const page = matching.slice(offset, offset + 1);
        return {
          Versions: page.map((version) => ({ Key: version.key, VersionId: version.id, LastModified: version.modified })),
          DeleteMarkers: deleted ? [{ Key: command.input.Prefix, VersionId: "delete-marker" }] : [],
          IsTruncated: offset + page.length < matching.length,
          NextKeyMarker: offset + page.length < matching.length ? page.at(-1)?.key : undefined,
          NextVersionIdMarker: offset + page.length < matching.length ? page.at(-1)?.id : undefined,
        };
      }
      if (command instanceof PutObjectCommand) {
        const version = {
          key: command.input.Key!, id: randomUUID(), body: Buffer.from(command.input.Body as Buffer),
          modified: new Date(), until: shortenUpload ? new Date(Date.now() + 1000) : command.input.ObjectLockRetainUntilDate!, encrypted: true,
        };
        versions.push(version);
        if (losePutResponse) { losePutResponse = false; throw new Error("timeout after send"); }
        return { VersionId: version.id };
      }
      if (command instanceof GetObjectCommand) {
        const version = versions.find((item) => item.key === command.input.Key && item.id === command.input.VersionId)!;
        return { Body: { transformToByteArray: async () => version.body }, ServerSideEncryption: version.encrypted ? "AES256" : undefined };
      }
      if (command instanceof GetObjectRetentionCommand) {
        const version = versions.find((item) => item.key === command.input.Key && item.id === command.input.VersionId)!;
        return { Retention: { Mode: "GOVERNANCE", RetainUntilDate: version.until } };
      }
      throw new Error("unexpected S3 command");
    },
  } as unknown as Pick<S3Client, "send">;
  return {
    store: new B2ReceiptStore<{ operationId: string; decision: string }>(config, "pause", client),
    versions,
    deleteMarker: () => { deleted = true; },
    outage: () => { unavailable = true; },
    shortUpload: () => { shortenUpload = true; },
    timeoutAfterPut: () => { losePutResponse = true; },
  };
}

it("reads every retained version across pages and accepts only identical retries", async () => {
  const { store, versions } = fixture();
  const receipt = { operationId: randomUUID(), decision: "pause" };
  await store.append(receipt);
  await store.append(receipt);
  expect(versions).toHaveLength(1);
  versions.push({ ...versions[0], id: randomUUID() });
  expect(await store.list()).toEqual([receipt]);
  await expect(store.append({ ...receipt, decision: "resume" })).rejects.toMatchObject({ code: "RECOVERY_CONFLICT" });
});

it("rejects short or missing retention on a new upload and on a same-body retry", async () => {
  const initial = fixture();
  initial.shortUpload();
  await expect(initial.store.append({ operationId: randomUUID(), decision: "pause" })).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  const { store, versions } = fixture();
  const receipt = { operationId: randomUUID(), decision: "pause" };
  await store.append(receipt);
  versions[0].until = new Date(Date.now() + 1000);
  await expect(store.append(receipt)).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  await expect(store.list()).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});

it("fails closed on a deletion marker, missing encryption, or provider outage", async () => {
  const one = fixture();
  const receipt = { operationId: randomUUID(), decision: "pause" };
  await one.store.append(receipt);
  one.versions[0].encrypted = false;
  await expect(one.store.list()).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  one.versions[0].encrypted = true;
  one.deleteMarker();
  await expect(one.store.list()).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  const two = fixture();
  two.outage();
  await expect(two.store.append(receipt)).rejects.toThrow("provider unavailable");
});

it("resolves an ambiguous upload from its surviving signed version on retry", async () => {
  const { store, versions, timeoutAfterPut } = fixture();
  const receipt = { operationId: randomUUID(), decision: "pause" };
  timeoutAfterPut();
  await expect(store.append(receipt)).rejects.toThrow("timeout after send");
  await store.append(receipt);
  expect(versions).toHaveLength(1);
  expect(await store.list()).toEqual([receipt]);
});
