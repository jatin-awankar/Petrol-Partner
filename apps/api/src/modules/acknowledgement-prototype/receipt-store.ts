import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export type RecoveryReceipt = {
  operationId: string;
  scope: string;
  idempotencyKey: string;
  payloadDigest: string;
  payload: { subject: string; delta: number };
  result: { value: number };
  committedAt: string;
};

type SignedReceipt = RecoveryReceipt & { signature: string };

function body(receipt: RecoveryReceipt) {
  return JSON.stringify(receipt);
}

export class FileReceiptStore {
  constructor(
    private readonly path: string,
    private readonly secret: string,
  ) {}

  async append(receipt: RecoveryReceipt) {
    await mkdir(dirname(this.path), { recursive: true });
    const signed: SignedReceipt = {
      ...receipt,
      signature: createHmac("sha256", this.secret).update(body(receipt)).digest("hex"),
    };
    const handle = await open(this.path, "a", 0o600);
    try {
      await handle.write(`${JSON.stringify(signed)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async list(): Promise<RecoveryReceipt[]> {
    let contents: string;
    try {
      contents = await readFile(this.path, "utf8");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    return contents
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const { signature, ...receipt } = JSON.parse(line) as SignedReceipt;
        const expected = createHmac("sha256", this.secret).update(body(receipt)).digest("hex");
        if (
          signature.length !== expected.length ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
        ) {
          throw new Error("Recovery receipt signature is invalid");
        }
        return receipt;
      });
  }

  async find(operationId: string) {
    return (await this.list()).find((receipt) => receipt.operationId === operationId);
  }
}

