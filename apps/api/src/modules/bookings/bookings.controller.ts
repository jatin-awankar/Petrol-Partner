import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import {
  bookingActionBodySchema,
  bookingIdParamSchema,
  createBookingSchema,
  listBookingsQuerySchema,
  updateBookingStatusLegacySchema,
} from "./bookings.schema";
import * as bookingsService from "./bookings.service";

function requireUserId(req: Request) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return req.user.userId;
}

export async function createBooking(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = createBookingSchema.parse(req.body);
  const booking = await bookingsService.createBooking(userId, input);

  res.status(201).json({
    message: "Booking created successfully",
    booking,
  });
}

export async function listBookings(req: Request, res: Response) {
  const userId = requireUserId(req);
  const query = listBookingsQuerySchema.parse(req.query);
  const result = await bookingsService.listBookings(userId, query);
  res.status(200).json(result);
}

export async function getBookingById(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { id } = bookingIdParamSchema.parse(req.params);
  const booking = await bookingsService.getBookingById(userId, id);
  res.status(200).json({ booking });
}

export async function confirmBooking(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { id } = bookingIdParamSchema.parse(req.params);
  const { reason } = bookingActionBodySchema.parse(req.body ?? {});
  const booking = await bookingsService.confirmBooking(id, userId, reason);

  res.status(200).json({
    message: "Booking confirmed successfully",
    booking,
  });
}

export async function cancelBooking(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { id } = bookingIdParamSchema.parse(req.params);
  const { reason } = bookingActionBodySchema.parse(req.body ?? {});
  const booking = await bookingsService.cancelBooking(id, userId, reason);

  res.status(200).json({
    message: "Booking cancelled successfully",
    booking,
  });
}

export async function completeBooking(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { id } = bookingIdParamSchema.parse(req.params);
  const { reason } = bookingActionBodySchema.parse(req.body ?? {});
  const booking = await bookingsService.completeBooking(id, userId, reason);

  res.status(200).json({
    message: "Booking completed successfully",
    booking,
  });
}

export async function updateBookingStatusLegacy(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = updateBookingStatusLegacySchema.parse(req.body);
  const booking = await bookingsService.updateBookingStatusLegacy(userId, input);

  res.status(200).json({
    message: "Booking status updated successfully",
    new_status: input.new_status,
    booking,
  });
}
