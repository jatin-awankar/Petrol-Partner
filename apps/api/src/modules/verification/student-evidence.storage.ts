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
  const path = pathFor(key);
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  catch (error) { await unlink(path).catch(() => undefined); throw error; }
  finally { await handle.close(); }
  return { key, contentType, byteCount: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function readEvidence(key: string) {
  return readFile(pathFor(key));
}

export async function deleteEvidence(key: string) {
  await unlink(pathFor(key));
}
