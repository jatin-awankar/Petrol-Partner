import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { link, mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AppError } from "../../shared/errors/app-error";
import type { IndependentEvidenceStore } from "../protected-mutation/protocol";

// Each operation owns one immutable file. A temporary file is synced, linked into
// place without replacement, then the directory is synced before acknowledgement.
export class SignedReceiptStore<T extends { operationId: string }> implements IndependentEvidenceStore<T> {
  constructor(private readonly directory: string, private readonly secret: string) {}

  private receiptPath(operationId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
      throw new AppError(503, "Recovery operation ID is invalid", "RECOVERY_INVALID");
    }
    return join(this.directory, `${operationId}.json`);
  }

  private async read(path: string): Promise<T> {
    const { signature, ...receipt } = JSON.parse(await readFile(path, "utf8")) as T & { signature: string };
    const expected = createHmac("sha256", this.secret).update(JSON.stringify(receipt)).digest("hex");
    if (typeof signature !== "string" || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new AppError(503, "Recovery evidence failed verification", "RECOVERY_INVALID");
    }
    return receipt as unknown as T;
  }

  async list(): Promise<T[]> {
    let names: string[];
    try { names = await readdir(this.directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const receipts: T[] = [];
    for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
      const receipt = await this.read(join(this.directory, name));
      if (join(this.directory, name) !== this.receiptPath(receipt.operationId)) {
        throw new AppError(503, "Recovery receipt path does not match its operation", "RECOVERY_INVALID");
      }
      receipts.push(receipt);
    }
    return receipts;
  }

  private async syncDirectory() {
    const handle = await open(this.directory, "r");
    try { await handle.sync(); } finally { await handle.close(); }
  }

  async append(receipt: T) {
    const target = this.receiptPath(receipt.operationId);
    const prior = (await this.list()).find((item) => item.operationId === receipt.operationId);
    if (prior) {
      if (JSON.stringify(prior) !== JSON.stringify(receipt)) throw new AppError(503, "Recovery evidence conflicts with database", "RECOVERY_CONFLICT");
      await this.syncDirectory();
      return;
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const parent = await open(dirname(this.directory), "r");
    try { await parent.sync(); } finally { await parent.close(); }
    const temporary = join(this.directory, `${receipt.operationId}.${randomUUID()}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try {
      try {
        const signature = createHmac("sha256", this.secret).update(JSON.stringify(receipt)).digest("hex");
        await handle.writeFile(JSON.stringify({ ...receipt, signature }));
        await handle.sync();
      } finally { await handle.close(); }
      try { await link(temporary, target); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const current = await this.read(target);
        if (JSON.stringify(current) !== JSON.stringify(receipt)) throw new AppError(503, "Recovery evidence conflicts with database", "RECOVERY_CONFLICT");
      }
      await this.syncDirectory();
    } finally { await unlink(temporary).catch(() => undefined); }
  }

  async probe() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.sync(); } finally { await handle.close(); await unlink(temporary).catch(() => undefined); }
    await this.syncDirectory();
  }
}
