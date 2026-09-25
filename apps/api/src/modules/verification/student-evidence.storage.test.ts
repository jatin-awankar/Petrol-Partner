import { afterEach, describe, expect, it, vi } from "vitest";
import { readEvidence, storeEvidence } from "./student-evidence.storage";

const keys = ["PILOT_EVIDENCE_BACKEND", "PILOT_EVIDENCE_SUPABASE_URL",
  "PILOT_EVIDENCE_SUPABASE_SERVICE_KEY", "PILOT_EVIDENCE_SUPABASE_BUCKET",
  "PILOT_EVIDENCE_PROVIDER_VERIFIED", "PILOT_STUDENT_REVIEW_RECEIPT_RETENTION_VERIFIED"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

function enableProvider() {
  process.env.PILOT_EVIDENCE_BACKEND = "supabase";
  process.env.PILOT_EVIDENCE_SUPABASE_URL = "https://storage.example.test";
  process.env.PILOT_EVIDENCE_SUPABASE_SERVICE_KEY = "synthetic-service-key";
  process.env.PILOT_EVIDENCE_SUPABASE_BUCKET = "pilot-student-evidence";
  process.env.PILOT_EVIDENCE_PROVIDER_VERIFIED = "true";
  process.env.PILOT_STUDENT_REVIEW_RECEIPT_RETENTION_VERIFIED = "true";
}

describe("private evidence adapter", () => {
  it("rejects a public bucket before upload", async () => {
    enableProvider();
    const fetcher = vi.fn(async () => Response.json({ public: true }));
    vi.stubGlobal("fetch", fetcher);
    await expect(storeEvidence(Buffer.from("%PDF-1.4\nsynthetic"), "application/pdf"))
      .rejects.toMatchObject({ code: "EVIDENCE_STORAGE_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a missing object from a provider outage", async () => {
    enableProvider();
    const key = "00000000-0000-4000-8000-000000000001";
    vi.stubGlobal("fetch", vi.fn(async (url: URL) =>
      String(url).includes("/bucket/") ? Response.json({ public: false }) : new Response(null, { status: 404 })));
    await expect(readEvidence(key)).rejects.toMatchObject({ code: "ENOENT" });
    vi.stubGlobal("fetch", vi.fn(async (url: URL) =>
      String(url).includes("/bucket/") ? Response.json({ public: false }) : new Response(null, { status: 503 })));
    await expect(readEvidence(key)).rejects.toMatchObject({ code: "EVIDENCE_STORAGE_UNAVAILABLE" });
  });
});
