import { createServer } from "http";

import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { dbQuery, pool } from "./db/pool";
import { initializeChatSocketServer } from "./modules/chat/chat.socket";
import {directSettlementSilenceService} from "./modules/rides/direct-settlement-silence.service";

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

  const app = createApp();

  const server = createServer(app);
  // Pilot chat remains closed even if a legacy environment flag is present.
  let settlementSweepBusy=false;
  const settlementSweepTimer=setInterval(()=>{
    if(settlementSweepBusy||shuttingDown) return;
    settlementSweepBusy=true;
    void directSettlementSilenceService.sweep().catch(error=>
      logger.error({error},'Direct settlement review sweep failed')).finally(()=>{settlementSweepBusy=false;});
  },10000);
  void directSettlementSilenceService.sweep().catch(error=>
    logger.error({error},'Initial direct settlement review sweep failed'));

  server.listen(env.PORT, env.HOST, () => {
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
    clearInterval(settlementSweepTimer);
    logger.info({ signal }, "Shutting down API server");

    server.close(async () => {
      await pool.end();
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
