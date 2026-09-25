import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { AppError } from "../../shared/errors/app-error";

export type EvidenceType = "image/jpeg" | "image/png" | "application/pdf";
const maximumBytes = 512 * 1024;

function directory() {
  const path = process.env.PILOT_SYNTHETIC_EVIDENCE_DIR;
  if (process.env.NODE_ENV === "production" || !path || !isAbsolute(path) ||
      resolve(path).startsWith(`${process.cwd()}/`)) {
    throw new AppError(503, "Synthetic evidence storage is unavailable", "EVIDENCE_STORAGE_UNAVAILABLE");
  }
  return path;
}

function supabaseConfig() {
  const url = process.env.PILOT_EVIDENCE_SUPABASE_URL;
  const key = process.env.PILOT_EVIDENCE_SUPABASE_SERVICE_KEY;
  const bucket = process.env.PILOT_EVIDENCE_SUPABASE_BUCKET;
  if (!url || !url.startsWith("https://") || !key || bucket !== "pilot-student-evidence" ||
      process.env.PILOT_EVIDENCE_PROVIDER_VERIFIED !== "true") {
    throw new AppError(503, "Private evidence storage is unavailable", "EVIDENCE_STORAGE_UNAVAILABLE");
  }
  if (process.env.PILOT_STUDENT_REVIEW_RECEIPT_RETENTION_VERIFIED !== "true") {
    throw new AppError(503, "Student review receipt retention is unverified", "EVIDENCE_STORAGE_UNAVAILABLE");
  }
  return { url: new URL(url), key, bucket };
}

function backend() {
  const value = process.env.PILOT_EVIDENCE_BACKEND ?? "synthetic";
  if (value !== "synthetic" && value !== "supabase") throw new AppError(503, "Evidence storage is unavailable", "EVIDENCE_STORAGE_UNAVAILABLE");
  if (process.env.NODE_ENV === "production" && value !== "supabase") throw new AppError(503, "Evidence storage is unavailable", "EVIDENCE_STORAGE_UNAVAILABLE");
  return value;
}

async function objectRequest(method: string, key: string, body?: Buffer, contentType?: string) {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new AppError(400, "Invalid evidence reference", "EVIDENCE_INVALID");
  const config = supabaseConfig();
  const url = new URL(method === "DELETE"
    ? `/storage/v1/object/${config.bucket}`
    : `/storage/v1/object/${config.bucket}/${key}`, config.url);
  const response = await fetch(url, { method, cache: "no-store", headers: {
    apikey: config.key, Authorization: `Bearer ${config.key}`,
    ...(method === "DELETE" ? { "Content-Type": "application/json" } : {}),
    ...(contentType ? { "Content-Type": contentType, "Cache-Control": "no-store", "x-upsert": "false" } : {}),
  }, body: method === "DELETE" ? JSON.stringify({ prefixes: [key] }) : body ? Uint8Array.from(body) : undefined });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as
      | { error?: string; statusCode?: string } | null;
    if (method === "GET" && (response.status === 404 ||
        (failure?.error === "not_found" && failure.statusCode === "404"))) {
      throw Object.assign(new Error("Evidence object missing"), { code: "ENOENT" });
    }
    throw new AppError(503, "Private evidence storage operation failed", "EVIDENCE_STORAGE_UNAVAILABLE");
  }
  return response;
}

async function assertPrivateBucket() {
  const config = supabaseConfig();
  const response = await fetch(new URL(`/storage/v1/bucket/${config.bucket}`, config.url), {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, cache: "no-store",
  });
  if (!response.ok || (await response.json() as { public?: boolean }).public !== false) {
    throw new AppError(503, "Private evidence bucket is unavailable", "EVIDENCE_STORAGE_UNAVAILABLE");
  }
}

function pathFor(key: string) {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new AppError(400, "Invalid evidence reference", "EVIDENCE_INVALID");
  return join(directory(), key);
}

export function validateEvidence(bytes: Buffer, contentType: string): asserts contentType is EvidenceType {
  const valid = contentType === "image/jpeg"
    ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : contentType === "image/png"
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : contentType === "application/pdf"
        ? bytes.subarray(0, 5).toString() === "%PDF-"
        : false;
  if (!bytes.length || bytes.length > maximumBytes || !valid) {
    throw new AppError(400, "Evidence must be a JPEG, PNG or PDF of at most 512 KB", "EVIDENCE_INVALID");
  }
}

export async function storeEvidence(bytes: Buffer, contentType: string) {
  validateEvidence(bytes, contentType);
  const key = randomUUID();
  if (backend() === "supabase") {
    await assertPrivateBucket();
    await objectRequest("POST", key, bytes, contentType);
    return { key, contentType, byteCount: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  const path = pathFor(key);
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  catch (error) { await unlink(path).catch(() => undefined); throw error; }
  finally { await handle.close(); }
  return { key, contentType, byteCount: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function readEvidence(key: string) {
  if (backend() === "supabase") {
    await assertPrivateBucket();
    return Buffer.from(await (await objectRequest("GET", key)).arrayBuffer());
  }
  return readFile(pathFor(key));
}

export async function deleteEvidence(key: string) {
  if (backend() === "supabase") { await objectRequest("DELETE", key); return; }
  await unlink(pathFor(key));
}
