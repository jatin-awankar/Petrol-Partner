import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { pool } from "./db/pool";

const app = createApp();

const server = app.listen(env.API_PORT, env.API_HOST, () => {
  logger.info(
    {
      host: env.API_HOST,
      port: env.API_PORT,
    },
    "API server listening",
  );
});

server.on("error", (error) => {
  logger.fatal({ error }, "API server failed to start");
  process.exit(1);
});

async function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "Shutting down API server");

  server.close(async () => {
    await pool.end();
    logger.info("Database pool closed");
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
