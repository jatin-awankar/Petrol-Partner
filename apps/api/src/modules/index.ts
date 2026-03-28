import { Router } from "express";

import { authRouter } from "./auth/auth.routes";
import { bookingsRouter } from "./bookings/bookings.routes";
import { chatRouter } from "./chat/chat.routes";
import { healthRouter } from "./health/health.routes";
import { matchingRouter } from "./matching/matching.routes";
import { notificationsRouter } from "./notifications/notifications.routes";
import { paymentsRouter } from "./payments/payments.routes";
import { pricingRouter } from "./pricing/pricing.routes";
import { profileRouter } from "./profile/profile.routes";
import { ridesRouter } from "./rides/rides.routes";
import { settlementsRouter } from "./settlements/settlements.routes";
import { trackingRouter } from "./tracking/tracking.routes";
import { verificationRouter } from "./verification/verification.routes";
import { webhooksRouter } from "./webhooks/webhooks.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/profile", profileRouter);
apiRouter.use("/rides", ridesRouter);
apiRouter.use("/bookings", bookingsRouter);
apiRouter.use("/verification", verificationRouter);
apiRouter.use("/matching", matchingRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/pricing", pricingRouter);
apiRouter.use("/settlements", settlementsRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/webhooks", webhooksRouter);
apiRouter.use("/chat", chatRouter);
apiRouter.use("/tracking", trackingRouter);
