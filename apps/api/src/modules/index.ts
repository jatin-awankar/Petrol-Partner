import { Router, type RequestHandler } from "express";
import { AppError } from "../shared/errors/app-error";

import { adultDeclarationRouter } from "./adult-declaration/adult-declaration.routes";
import { driverVehicleDeclarationRouter } from "./driver-vehicle-declaration/driver-vehicle-declaration.routes";
import { authRouter } from "./auth/auth.routes";
import { bookingsRouter } from "./bookings/bookings.routes";
import { chatRouter } from "./chat/chat.routes";
import { healthRouter } from "./health/health.routes";
import { matchingRouter } from "./matching/matching.routes";
import { operatorRouter } from "./operator/operator.routes";
import { notificationsRouter } from "./notifications/notifications.routes";
import { paymentsRouter } from "./payments/payments.routes";
import { pricingRouter } from "./pricing/pricing.routes";
import { profileRouter } from "./profile/profile.routes";
import { ridesRouter } from "./rides/rides.routes";
import { corridorOffersRouter } from "./rides/corridor-offers.routes";
import { seatRequestsRouter } from "./rides/seat-requests.routes";
import { settlementsRouter } from "./settlements/settlements.routes";
import { directSettlementRouter } from "./rides/direct-settlement.routes";
import { trackingRouter } from "./tracking/tracking.routes";
import { verificationRouter } from "./verification/verification.routes";
import { webhooksRouter } from "./webhooks/webhooks.routes";

export const apiRouter = Router();
const pilotDisabled = () => { throw new AppError(410,
  "This capability is unavailable in the corridor pilot", "PILOT_SCOPE_DISABLED"); };
const legacyReadOnly: RequestHandler = (req, _res, next) =>
  req.method === "GET" ? next() : pilotDisabled();

apiRouter.use(healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/adult-declaration", adultDeclarationRouter);
apiRouter.use("/driver-vehicle-declarations", driverVehicleDeclarationRouter);
apiRouter.use("/operator", operatorRouter);
apiRouter.use("/profile", profileRouter);
apiRouter.use("/rides", pilotDisabled);
// Historical records remain available through their participant-scoped read handlers.
apiRouter.use("/bookings", legacyReadOnly);
apiRouter.use("/settlements", legacyReadOnly);
apiRouter.use("/matching", pilotDisabled);
apiRouter.use("/pricing", pilotDisabled);
apiRouter.use("/chat", pilotDisabled);
apiRouter.use("/tracking", pilotDisabled);
apiRouter.use("/webhooks", pilotDisabled);
apiRouter.use("/payments", (req, _res, next) => {
  if (req.method === "GET" && /^\/bookings\/[^/]+\/status$/.test(req.path)) return next();
  return pilotDisabled();
});
apiRouter.use("/rides", ridesRouter);
apiRouter.use("/corridor-offers", corridorOffersRouter);
apiRouter.use("/seat-requests", seatRequestsRouter);
apiRouter.use("/bookings", bookingsRouter);
apiRouter.use("/verification", verificationRouter);
apiRouter.use("/matching", matchingRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/pricing", pricingRouter);
apiRouter.use("/settlements", settlementsRouter);
apiRouter.use("/direct-settlements", directSettlementRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/webhooks", webhooksRouter);
apiRouter.use("/chat", chatRouter);
apiRouter.use("/tracking", trackingRouter);
