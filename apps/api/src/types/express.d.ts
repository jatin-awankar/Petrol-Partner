import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: Logger;
      user?: {
        userId: string;
        email: string;
        role: string;
        authProvider: "legacy" | "supabase";
        assuranceLevel?: string | null;
      };
    }
  }
}

export { };
