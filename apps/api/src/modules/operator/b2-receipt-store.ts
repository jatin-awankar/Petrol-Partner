import { createHmac, timingSafeEqual } from "node:crypto";
import {
  GetBucketEncryptionCommand, GetObjectCommand, GetObjectLockConfigurationCommand,
  GetObjectRetentionCommand, HeadBucketCommand, ListObjectVersionsCommand,
  PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import { AppError } from "../../shared/errors/app-error";
import type { IndependentEvidenceStore } from "../protected-mutation/protocol";

const operationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type B2ReceiptConfig = {
  endpoint: string;
  bucket: string;
  keyId: string;
  applicationKey: string;
  prefix: string;
  retentionDays: number;
  secret: string;
};

// B2 does not implement conditional PutObject. The database row lock serializes
// legitimate publishers; reading every retained version detects unexpected writes.
export class B2ReceiptStore<T extends { operationId: string }> implements IndependentEvidenceStore<T> {
  private readonly client: Pick<S3Client, "send">;

  constructor(private readonly config: B2ReceiptConfig, private readonly kind: "pause" | "reopen" | "student-review" | "driver-car-review" | "ride-departure" | "corridor-offer" | "seat-request", client?: Pick<S3Client, "send">) {
    const endpoint = new URL(config.endpoint);
    if (endpoint.protocol !== "https:" || !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/.test(endpoint.hostname) ||
        !/^[a-z0-9][a-z0-9/-]*[a-z0-9]$/.test(config.prefix) || config.prefix.includes("//") ||
        !Number.isInteger(config.retentionDays) || config.retentionDays < 1 || config.secret.length < 32) {
      throw new AppError(503, "Recovery evidence configuration is invalid", "RECOVERY_UNAVAILABLE");
    }
    this.client = client ?? new S3Client({
      endpoint: config.endpoint,
      region: endpoint.hostname.split(".")[1],
      credentials: { accessKeyId: config.keyId, secretAccessKey: config.applicationKey },
      forcePathStyle: true,
      maxAttempts: 2,
    });
  }

  private key(operationId: string) {
    if (!operationIdPattern.test(operationId)) throw new AppError(503, "Recovery operation ID is invalid", "RECOVERY_INVALID");
    return `${this.config.prefix}/receipts/${this.kind}/${operationId}.json`;
  }

  private async versions(prefix: string) {
    const versions: Array<{ key: string; versionId: string; lastModified: Date }> = [];
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
      const page = await this.client.send(new ListObjectVersionsCommand({
        Bucket: this.config.bucket, Prefix: prefix, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker,
      }));
      if (page.DeleteMarkers?.length) throw new AppError(503, "Recovery evidence has a deletion marker", "RECOVERY_INVALID");
      for (const version of page.Versions ?? []) {
        if (!version.Key || !version.VersionId || !version.LastModified) throw new AppError(503, "Recovery evidence version is incomplete", "RECOVERY_INVALID");
        versions.push({ key: version.Key, versionId: version.VersionId, lastModified: version.LastModified });
      }
      if (!page.IsTruncated) break;
      if (!page.NextKeyMarker || !page.NextVersionIdMarker ||
          (page.NextKeyMarker === keyMarker && page.NextVersionIdMarker === versionIdMarker)) {
        throw new AppError(503, "Recovery evidence listing did not advance", "RECOVERY_INVALID");
      }
      keyMarker = page.NextKeyMarker;
      versionIdMarker = page.NextVersionIdMarker;
    } while (true);
    return versions;
  }

  private async read(key: string, versionId: string, lastModified: Date): Promise<T> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key, VersionId: versionId }));
    if (!object.Body || object.ServerSideEncryption !== "AES256") throw new AppError(503, "Recovery evidence is unprotected", "RECOVERY_INVALID");
    await this.verifyRetention(key, versionId, lastModified.getTime() + this.config.retentionDays * 86400000);
    const bytes = await object.Body.transformToByteArray();
    if (bytes.length > 65536) throw new AppError(503, "Recovery evidence is oversized", "RECOVERY_INVALID");
    let parsed: T & { signature: string };
    try { parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as T & { signature: string }; }
    catch { throw new AppError(503, "Recovery evidence is malformed", "RECOVERY_INVALID"); }
    const { signature, ...receipt } = parsed;
    const expected = createHmac("sha256", this.config.secret).update(JSON.stringify(receipt)).digest("hex");
    if (typeof signature !== "string" || signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) || this.key(receipt.operationId) !== key) {
      throw new AppError(503, "Recovery evidence failed verification", "RECOVERY_INVALID");
    }
    return receipt as unknown as T;
  }

  private async verifyRetention(key: string, versionId: string, expectedUntil: number) {
    const retention = await this.client.send(new GetObjectRetentionCommand({
      Bucket: this.config.bucket, Key: key, VersionId: versionId,
    }));
    const until = retention.Retention?.RetainUntilDate?.getTime();
    if (retention.Retention?.Mode !== "GOVERNANCE" || !until ||
        until < Date.now() || until < expectedUntil - 60000) {
      throw new AppError(503, "Recovery evidence retention is missing or too short", "RECOVERY_INVALID");
    }
  }

  private async matchingReceipts(operationId: string) {
    const key = this.key(operationId);
    const receipts: T[] = [];
    for (const version of await this.versions(key)) {
      if (version.key === key) receipts.push(await this.read(key, version.versionId, version.lastModified));
    }
    return receipts;
  }

  async list(): Promise<T[]> {
    const byId = new Map<string, T>();
    for (const version of await this.versions(`${this.config.prefix}/receipts/${this.kind}/`)) {
      const receipt = await this.read(version.key, version.versionId, version.lastModified);
      const prior = byId.get(receipt.operationId);
      if (prior && JSON.stringify(prior) !== JSON.stringify(receipt)) {
        throw new AppError(503, "Recovery evidence contains conflicting versions", "RECOVERY_CONFLICT");
      }
      byId.set(receipt.operationId, receipt);
    }
    return [...byId.values()].sort((a, b) => a.operationId.localeCompare(b.operationId));
  }

  async append(receipt: T): Promise<void> {
    const key = this.key(receipt.operationId);
    const existing = await this.matchingReceipts(receipt.operationId);
    if (existing.length) {
      if (existing.some((item) => JSON.stringify(item) !== JSON.stringify(receipt))) {
        throw new AppError(503, "Recovery evidence conflicts with database", "RECOVERY_CONFLICT");
      }
      return;
    }
    const signature = createHmac("sha256", this.config.secret).update(JSON.stringify(receipt)).digest("hex");
    const body = Buffer.from(JSON.stringify({ ...receipt, signature }));
    const expectedUntil = Date.now() + this.config.retentionDays * 86400000;
    const uploaded = await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket, Key: key, Body: body, ContentType: "application/json",
      ServerSideEncryption: "AES256", ObjectLockMode: "GOVERNANCE",
      ObjectLockRetainUntilDate: new Date(expectedUntil),
    }));
    if (!uploaded.VersionId) throw new AppError(503, "Recovery evidence version was not returned", "RECOVERY_INVALID");
    await this.verifyRetention(key, uploaded.VersionId, expectedUntil);
    const current = await this.matchingReceipts(receipt.operationId);
    if (!current.length || current.some((item) => JSON.stringify(item) !== JSON.stringify(receipt))) {
      throw new AppError(503, "Recovery evidence could not be verified", "RECOVERY_CONFLICT");
    }
  }

  async probe(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    const lock = await this.client.send(new GetObjectLockConfigurationCommand({ Bucket: this.config.bucket }));
    const encryption = await this.client.send(new GetBucketEncryptionCommand({ Bucket: this.config.bucket }));
    if (lock.ObjectLockConfiguration?.ObjectLockEnabled !== "Enabled" ||
        !encryption.ServerSideEncryptionConfiguration?.Rules?.some((rule) => rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm === "AES256")) {
      throw new AppError(503, "Recovery bucket protection is incomplete", "RECOVERY_INVALID");
    }
  }
}
