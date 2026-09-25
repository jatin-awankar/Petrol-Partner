import { randomUUID } from "node:crypto";
import { S3Client, GetBucketLifecycleConfigurationCommand, GetObjectCommand,
  GetObjectRetentionCommand, ListObjectVersionsCommand } from "@aws-sdk/client-s3";
import { B2ReceiptStore } from "../apps/api/src/modules/operator/b2-receipt-store";
import type { ReviewReceipt } from "../apps/api/src/modules/verification/student-review.service";

async function main() {
if (process.env.PILOT_B2_LIVE_TEST !== "true") {
  throw new Error("Set PILOT_B2_LIVE_TEST=true to authorize a synthetic retained B2 receipt");
}
const { PILOT_B2_BUCKET: bucket, PILOT_B2_ENDPOINT: endpoint,
  PILOT_B2_WRITER_KEY_ID: keyId, PILOT_B2_WRITER_KEY: applicationKey,
  PILOT_B2_READER_KEY_ID: readerId, PILOT_B2_READER_KEY: readerKey,
  PILOT_RECEIPT_SECRET: secret } = process.env;
if (!bucket || !endpoint || !keyId || !applicationKey || !readerId || !readerKey || !secret) {
  throw new Error("Existing B2 writer, reader and signing credentials are required");
}
const prefix = `ticket11synthetic/ticket12/${randomUUID()}`;
const config = { bucket, endpoint, keyId, applicationKey, prefix, retentionDays: 30, secret };
const writer = new S3Client({ endpoint, region: new URL(endpoint).hostname.split(".")[1],
  credentials: { accessKeyId: keyId, secretAccessKey: applicationKey }, forcePathStyle: true, maxAttempts: 2 });
const lifecycle = await writer.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
const covered = lifecycle.Rules?.some((rule) => rule.Status === "Enabled" &&
  prefix.startsWith(rule.Filter?.Prefix ?? "") && (rule.Filter?.Prefix?.length ?? 0) > 0 &&
  (rule.Expiration?.Days ?? 0) >= 30 && (rule.Expiration?.Days ?? Infinity) <= 85 &&
  (rule.NoncurrentVersionExpiration?.NoncurrentDays ?? Infinity) <= 2);
if (!covered) throw new Error("The synthetic rehearsal prefix lacks a bounded B2 lifecycle rule");
const store = new B2ReceiptStore<ReviewReceipt>(config, "student-review");
const operationId = randomUUID();
const receipt: ReviewReceipt = {
  operationId, operatorId: randomUUID(), targetUserId: randomUUID(), idempotencyKey: randomUUID(),
  payloadDigest: "synthetic-digest", outcome: "rejected", adultEligible: true,
  reason: "Synthetic ticket 12 receipt rehearsal", reviewCycle: 1, verificationId: randomUUID(),
  studentSnapshot: {
    provider: "synthetic", enrolledName: "Synthetic Student", institutionName: "Synthetic College",
    programName: null, admissionYear: 2025, graduationYear: 2029,
    evidenceCategory: "synthetic", ageEvidenceCategory: "synthetic",
    eligibilityStartsAt: null, eligibilityEndsAt: "2029-12-31T00:00:00.000Z", revalidateAfter: null,
  }, evidenceSnapshot: [], committedAt: new Date().toISOString(),
};
await store.append(receipt);
await store.append(receipt);
const rows = await store.list();
if (rows.length !== 1 || JSON.stringify(rows[0]) !== JSON.stringify(receipt)) {
  throw new Error("Writer readback did not match the synthetic receipt");
}
const reader = new S3Client({ endpoint, region: new URL(endpoint).hostname.split(".")[1],
  credentials: { accessKeyId: readerId, secretAccessKey: readerKey }, forcePathStyle: true, maxAttempts: 2 });
const key = `${prefix}/receipts/student-review/${operationId}.json`;
const listed = await reader.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key }));
const version = listed.Versions?.filter((item) => item.Key === key);
if (version?.length !== 1 || !version[0].VersionId) throw new Error("Separate reader did not find exactly one version");
const object = await reader.send(new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: version[0].VersionId }));
const bytes = await object.Body?.transformToByteArray();
if (!bytes || object.ServerSideEncryption !== "AES256" ||
    JSON.parse(Buffer.from(bytes).toString("utf8")).operationId !== operationId) {
  throw new Error("Separate reader could not verify the encrypted receipt");
}
const lock = await reader.send(new GetObjectRetentionCommand({ Bucket: bucket, Key: key, VersionId: version[0].VersionId }));
if (lock.Retention?.Mode !== "GOVERNANCE" ||
    (lock.Retention.RetainUntilDate?.getTime() ?? 0) < Date.now() + 29 * 86400000) {
  throw new Error("The review receipt does not have the required 30-day lock");
}
console.log(JSON.stringify({ prefix, kind: "student-review", versions: version.length,
  writerReadback: true, separateReaderReadback: true, encrypted: true,
  governanceDaysAtLeast: 29, syntheticOnly: true, completedAt: new Date().toISOString() }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
