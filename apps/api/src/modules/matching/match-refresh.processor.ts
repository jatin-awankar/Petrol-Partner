import { env } from "../../config/env";
import { logger } from "../../config/logger";
import * as matchingService from "./matching.service";

let intervalHandle: NodeJS.Timeout | null = null;
let tickInFlight = false;

async function runTick() {
  if (tickInFlight) {
    return;
  }

  tickInFlight = true;

  try {
    const result = await matchingService.processPendingMatchRefreshRequests(10);

    if (result.claimed_count > 0) {
      logger.info(result, "Processed pending match refresh requests");
    }
  } catch (error) {
    logger.error({ error }, "Match refresh processor tick failed");
  } finally {
    tickInFlight = false;
  }
}

export function startMatchRefreshProcessor() {
  if (!env.ENABLE_MATCH_REFRESH_PROCESSOR || env.NODE_ENV === "test" || intervalHandle) {
    return;
  }

  intervalHandle = setInterval(() => {
    void runTick();
  }, env.MATCH_REFRESH_PROCESSOR_INTERVAL_MS);

  intervalHandle.unref();
  void runTick();

  logger.info(
    {
      intervalMs: env.MATCH_REFRESH_PROCESSOR_INTERVAL_MS,
    },
    "Started match refresh processor",
  );
}

export async function stopMatchRefreshProcessor() {
  if (!intervalHandle) {
    return;
  }

  clearInterval(intervalHandle);
  intervalHandle = null;
}
