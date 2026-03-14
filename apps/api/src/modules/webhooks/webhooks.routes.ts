import { Router } from "express";

export const webhooksRouter = Router();

webhooksRouter.post("/razorpay", (_req, res) => {
  res.status(501).json({
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Razorpay webhook processing has not been moved yet. Persist the raw event first, then process it asynchronously.",
    },
  });
});
