import { Router } from "express";

import { authRouter } from "./auth/auth.routes";
import { bookingsRouter } from "./bookings/bookings.routes";
import { chatRouter } from "./chat/chat.routes";
import { healthRouter } from "./health/health.routes";
import { paymentsRouter } from "./payments/payments.routes";
import { ridesRouter } from "./rides/rides.routes";
import { trackingRouter } from "./tracking/tracking.routes";
import { webhooksRouter } from "./webhooks/webhooks.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/rides", ridesRouter);
apiRouter.use("/bookings", bookingsRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/webhooks", webhooksRouter);
apiRouter.use("/chat", chatRouter);
apiRouter.use("/tracking", trackingRouter);
