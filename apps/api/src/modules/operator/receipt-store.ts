import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AppError } from "../../shared/errors/app-error";

export class SignedReceiptStore<T extends { operationId: string }> {
  constructor(private readonly path: string, private readonly secret: string) {}

  async list(): Promise<T[]> {
    let data: string;
    try { data = await readFile(this.path, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    return data.split("\n").filter(Boolean).map((line) => {
      const { signature, ...receipt } = JSON.parse(line) as T & { signature: string };
      const expected = createHmac("sha256", this.secret).update(JSON.stringify(receipt)).digest("hex");
      if (typeof signature !== "string" || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        throw new AppError(503, "Recovery evidence failed verification", "RECOVERY_INVALID");
      }
      return receipt as unknown as T;
    });
  }

  async append(receipt: T) {
    const existing = (await this.list()).find((item) => item.operationId === receipt.operationId);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(receipt)) throw new AppError(503, "Recovery evidence conflicts with database", "RECOVERY_CONFLICT");
      return;
    }
    await mkdir(dirname(this.path), { recursive: true });
    const handle = await open(this.path, "a", 0o600);
    try {
      await handle.write(`${JSON.stringify({ ...receipt, signature: createHmac("sha256", this.secret).update(JSON.stringify(receipt)).digest("hex") })}\n`);
      await handle.sync();
    } finally { await handle.close(); }
  }

  async probe() {
    await mkdir(dirname(this.path), { recursive: true });
    const handle = await open(this.path, "a", 0o600);
    try { await handle.sync(); } finally { await handle.close(); }
  }
}
