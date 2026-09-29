import { expect, it } from "vitest";
import { rejectPayoutJob } from "./payout.job";

it("fails queued legacy payout work rather than acknowledging a transfer", () => {
  expect(() => rejectPayoutJob("legacy-payout")).toThrow("PLATFORM_PAYOUT_DISABLED");
});
