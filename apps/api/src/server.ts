import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { dbQuery, pool } from "./db/pool";
import { startMatchRefreshProcessor, stopMatchRefreshProcessor } from "./modules/matching/match-refresh.processor";
import { assertQueueRuntimeReady, closeApiQueues } from "./queues";

let shuttingDown = false;

async function bootstrap() {
  logger.info("Bootstrapping API server");

  try {
    await dbQuery("SELECT 1");
    logger.info("Database connectivity check passed");
  } catch (error) {
    logger.fatal(
      {
        err: error,
        stage: "database_connectivity_check",
      },
      "API bootstrap failed",
    );
    throw error;
  }

  try {
    await assertQueueRuntimeReady();
    logger.info("Redis queue runtime is ready");
  } catch (error) {
    if (env.NODE_ENV === "production") {
      throw error;
    }

    logger.warn(
      {
        err: error,
        stage: "queue_runtime_check",
      },
      "API Redis queues are unavailable; readiness will stay degraded",
    );
  }

  const app = createApp();

  try {
    startMatchRefreshProcessor();
    logger.info("Match refresh processor startup completed");
  } catch (error) {
    logger.fatal(
      {
        err: error,
        stage: "match_refresh_processor_start",
      },
      "API bootstrap failed",
    );
    throw error;
  }

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      {
        host: env.HOST,
        port: env.PORT,
      },
      "API server listening",
    );
  });

  server.on("error", (error) => {
    logger.fatal({ error }, "API server failed to start");
    process.exit(1);
  });

  async function shutdown(signal: NodeJS.Signals) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, "Shutting down API server");

    server.close(async () => {
      await Promise.allSettled([stopMatchRefreshProcessor(), closeApiQueues(), pool.end()]);
      logger.info("API dependencies closed");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Forced API shutdown after timeout");
      process.exit(1);
    }, 10000).unref();
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void bootstrap().catch((error) => {
  logger.fatal({ err: error }, "API bootstrap failed");
  process.exit(1);
});
