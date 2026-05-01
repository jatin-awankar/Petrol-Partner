import { logger } from "../../config/logger";
import { withTransaction } from "../../db/transaction";
import { cancelBookingExpiry, scheduleBookingExpiry } from "../../queues";
import { AppError } from "../../shared/errors/app-error";
import { emitChatRoomLocked } from "../chat/chat.socket";
import * as chatService from "../chat/chat.service";
import * as settlementsService from "../settlements/settlements.service";
import * as verificationRepo from "../verification/verification.repo";
import type {
  CreateBookingInput,
  ListBookingsQuery,
  UpdateBookingStatusLegacyInput,
} from "./bookings.schema";
import * as bookingsRepo from "./bookings.repo";

const BOOKING_EXPIRY_MINUTES = 10;
const ACTIVE_BOOKING_STATUSES = new Set(["pending", "confirmed"]);

function matchesCounterpartyGenderPreference(
  preference: string,
  gender: string | null,
) {
  if (preference === "any") {
    return true;
  }

  if (!gender) {
    return false;
  }

  return (
    (preference === "female_only" && gender === "female") ||
    (preference === "male_only" && gender === "male")
  );
}

function addMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function getPlatformFeePerSeatPaise(pricingSnapshot: Record<string, unknown> | undefined) {
  const rawValue = pricingSnapshot?.platformFeePerSeatPaise;

  if (typeof rawValue === "number") {
    return rawValue;
  }

  if (typeof rawValue === "string") {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getBookingFlow(booking: {
  ride_offer_id: string | null;
  ride_request_id: string | null;
}) {
  return booking.ride_offer_id ? "offer" : "request";
}

function getRideOwnerId(booking: {
  ride_offer_id: string | null;
  driver_id: string;
  passenger_id: string;
}) {
  return booking.ride_offer_id ? booking.driver_id : booking.passenger_id;
}

function mapCancelledPaymentState(currentPaymentState: string) {
  if (currentPaymentState === "paid_escrow") {
    return "refund_pending";
  }

  if (
    ["unpaid", "order_created", "verification_pending", "failed", "cancelled"].includes(
      currentPaymentState,
    )
  ) {
    return "cancelled";
  }

  return currentPaymentState;
}

async function getExistingBookingForUser(bookingId: string, userId: string) {
  const booking = await bookingsRepo.findBookingByIdForUser(bookingId, userId);

  if (!booking) {
    throw new AppError(404, "Booking not found", "BOOKING_NOT_FOUND");
  }

  return booking;
}

function ensureNotTerminal(status: string) {
  if (!ACTIVE_BOOKING_STATUSES.has(status)) {
    throw new AppError(409, "Booking can no longer be changed", "BOOKING_ALREADY_TERMINAL");
  }
}

function parseRideDeparture(ride: {
  date: Date | string;
  time: Date | string;
}) {
  const rideDate = new Date(ride.date);
  const timeToken = String(ride.time).slice(0, 8);
  const [hours, minutes, seconds] = timeToken.split(":").map((part) => Number(part));
  const departure = new Date(rideDate);
  departure.setHours(
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    Number.isFinite(seconds) ? seconds : 0,
    0,
  );
  return departure;
}

async function assertApprovedDriverWithVehicle(userId: string) {
  const eligibility = await verificationRepo.findTransactionEligibilityByUserId(userId);

  if (eligibility?.driver_eligibility_status !== "approved") {
    throw new AppError(
      403,
      "Approved driver eligibility is required before booking ride requests",
      "DRIVER_ELIGIBILITY_NOT_APPROVED",
      {
        status: eligibility?.driver_eligibility_status ?? null,
      },
    );
  }

  const vehicles = await verificationRepo.listVehiclesByOwner(userId);
  const hasApprovedVehicle = vehicles.some(
    (vehicle) => vehicle.status === "active" && vehicle.verification_status === "approved",
  );

  if (!hasApprovedVehicle) {
    throw new AppError(
      403,
      "At least one approved active vehicle is required before booking ride requests",
      "VEHICLE_NOT_APPROVED",
    );
  }
}

export async function createBooking(userId: string, input: CreateBookingInput) {
  await settlementsService.assertUserCanTransact(userId);
  const isRideOfferFlow = Boolean(input.ride_offer_id);

  if (!isRideOfferFlow) {
    await assertApprovedDriverWithVehicle(userId);
  }

  const created = await withTransaction(async (client) => {
    const rideResult = isRideOfferFlow
      ? await bookingsRepo.findRideOfferForUpdate(input.ride_offer_id!, client)
      : await bookingsRepo.findRideRequestForUpdate(input.ride_request_id!, client);

    if (rideResult.rowCount === 0) {
      throw new AppError(404, "Ride not found", "RIDE_NOT_FOUND");
    }

    const ride = rideResult.rows[0];

    if (ride.status !== "active") {
      throw new AppError(409, "Ride is not available for booking", "RIDE_NOT_BOOKABLE");
    }

    const rideDepartureAt = parseRideDeparture(ride);
    if (rideDepartureAt.getTime() <= Date.now()) {
      throw new AppError(409, "Ride has already departed", "RIDE_DEPARTED");
    }

    if (ride.owner_id === userId) {
      throw new AppError(409, "You cannot book your own ride", "SELF_BOOKING_FORBIDDEN");
    }

    const actorGenderForMatching = await bookingsRepo.findUserGenderForMatching(userId, client);

    if (
      !matchesCounterpartyGenderPreference(
        ride.counterparty_gender_preference,
        actorGenderForMatching,
      )
    ) {
      throw new AppError(
        409,
        "You do not meet this ride's gender preference",
        "BOOKING_GENDER_PREFERENCE_MISMATCH",
      );
    }

    if (ride.seat_count < input.seats_booked) {
      throw new AppError(409, "Not enough seats available", "INSUFFICIENT_SEATS");
    }

    const driverId = isRideOfferFlow ? ride.owner_id : userId;
    const passengerId = isRideOfferFlow ? userId : ride.owner_id;
    const expiresAt = addMinutes(BOOKING_EXPIRY_MINUTES);
    const totalAmountPaise = ride.price_per_seat_paise * input.seats_booked;
    const platformFeePaise =
      getPlatformFeePerSeatPaise(ride.pricing_snapshot) * input.seats_booked;

    let bookingId: string;

    try {
      const insertedBooking = await bookingsRepo.insertBooking(
        {
          rideOfferId: input.ride_offer_id ?? null,
          rideRequestId: input.ride_request_id ?? null,
          createdByUserId: userId,
          passengerId,
          driverId,
          seatsBooked: input.seats_booked,
          totalAmountPaise,
          platformFeePaise,
          status: "pending",
          paymentState: "unpaid",
          expiresAt,
          pricingSnapshot: {
            ...(ride.pricing_snapshot ?? {}),
            seatsBooked: input.seats_booked,
          },
        },
        client,
      );

      bookingId = insertedBooking.id;
    } catch (error: any) {
      if (error?.code === "23505") {
        throw new AppError(
          409,
          "An active booking already exists for this ride and participant pair",
          "DUPLICATE_ACTIVE_BOOKING",
        );
      }

      throw error;
    }

    if (isRideOfferFlow) {
      const rowCount = await bookingsRepo.decrementRideOfferSeats(
        input.ride_offer_id!,
        input.seats_booked,
        client,
      );
      if (rowCount !== 1) {
        throw new AppError(409, "Not enough seats available", "INSUFFICIENT_SEATS");
      }
    } else {
      const rowCount = await bookingsRepo.decrementRideRequestSeats(
        input.ride_request_id!,
        input.seats_booked,
        client,
      );
      if (rowCount !== 1) {
        throw new AppError(409, "Not enough seats available", "INSUFFICIENT_SEATS");
      }
    }

    await bookingsRepo.insertBookingStatusEvent(
      {
        bookingId,
        fromStatus: null,
        toStatus: "pending",
        actorUserId: userId,
        metadata: {
          bookingFlow: isRideOfferFlow ? "offer" : "request",
          sourceRideId: input.ride_offer_id ?? input.ride_request_id,
          seatsBooked: input.seats_booked,
          counterpartyGenderPreference: ride.counterparty_gender_preference,
          platformFeePaise,
        },
      },
      client,
    );

    await scheduleBookingExpiry({
      bookingId,
      expiresAt,
    });

    return { bookingId };
  });

  return getExistingBookingForUser(created.bookingId, userId);
}

export async function listBookings(userId: string, query: ListBookingsQuery) {
  const result = await bookingsRepo.listBookingsForUser({
    userId,
    limit: query.limit,
    offset: query.offset,
    status: query.status,
  });

  return {
    bookings: result.bookings,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      count: result.bookings.length,
      total: result.totalCount,
    },
  };
}

export function getBookingById(userId: string, bookingId: string) {
  return getExistingBookingForUser(bookingId, userId);
}

export async function confirmBooking(bookingId: string, actorUserId: string, reason?: string) {
  await withTransaction(async (client) => {
    const booking = await bookingsRepo.findBookingForUpdate(bookingId, client);

    if (!booking) {
      throw new AppError(404, "Booking not found", "BOOKING_NOT_FOUND");
    }

    ensureNotTerminal(booking.status);

    if (booking.status !== "pending") {
      throw new AppError(
        409,
        "Only pending bookings can be confirmed",
        "BOOKING_CONFIRM_INVALID_STATUS",
      );
    }

    if (getRideOwnerId(booking) !== actorUserId) {
      throw new AppError(403, "Only the ride owner can confirm this booking", "FORBIDDEN");
    }

    const now = new Date();

    await bookingsRepo.updateBookingLifecycle(
      {
        bookingId,
        status: "confirmed",
        expiresAt: null,
        confirmedAt: booking.confirmed_at ? undefined : now,
      },
      client,
    );

    await bookingsRepo.insertBookingStatusEvent(
      {
        bookingId,
        fromStatus: booking.status,
        toStatus: "confirmed",
        actorUserId,
        reason,
        metadata: {
          bookingFlow: getBookingFlow(booking),
          previousPaymentState: booking.payment_state,
        },
      },
      client,
    );

    await chatService.ensureRoomForConfirmedBooking(
      {
        bookingId,
        driverId: booking.driver_id,
        passengerId: booking.passenger_id,
      },
      client,
    );
  });

  try {
    await cancelBookingExpiry(bookingId);
  } catch (error) {
    logger.warn({ error, bookingId }, "Failed to remove booking expiry job after confirmation");
  }

  return getExistingBookingForUser(bookingId, actorUserId);
}

export async function cancelBooking(bookingId: string, actorUserId: string, reason?: string) {
  const transactionResult = await withTransaction(async (client) => {
    const booking = await bookingsRepo.findBookingForUpdate(bookingId, client);

    if (!booking) {
      throw new AppError(404, "Booking not found", "BOOKING_NOT_FOUND");
    }

    ensureNotTerminal(booking.status);

    const isParticipant =
      booking.driver_id === actorUserId || booking.passenger_id === actorUserId;

    if (!isParticipant) {
      throw new AppError(403, "You cannot cancel this booking", "FORBIDDEN");
    }

    if (booking.ride_offer_id) {
      await bookingsRepo.restoreRideOfferSeats(booking.ride_offer_id, booking.seats_booked, client);
    }

    if (booking.ride_request_id) {
      await bookingsRepo.restoreRideRequestSeats(
        booking.ride_request_id,
        booking.seats_booked,
        client,
      );
    }

    await bookingsRepo.updateBookingLifecycle(
      {
        bookingId,
        status: "cancelled",
        paymentState: mapCancelledPaymentState(booking.payment_state),
        expiresAt: null,
        cancelledAt: booking.cancelled_at ? undefined : new Date(),
      },
      client,
    );

    await bookingsRepo.insertBookingStatusEvent(
      {
        bookingId,
        fromStatus: booking.status,
        toStatus: "cancelled",
        actorUserId,
        reason,
        metadata: {
          bookingFlow: getBookingFlow(booking),
          previousPaymentState: booking.payment_state,
        },
      },
      client,
    );

    const lockedRoom = await chatService.lockRoomForTerminalBooking(bookingId, client);

    return {
      lockedRoom,
    };
  });

  try {
    await cancelBookingExpiry(bookingId);
  } catch (error) {
    logger.warn({ error, bookingId }, "Failed to remove booking expiry job after cancellation");
  }

  if (transactionResult.lockedRoom) {
    emitChatRoomLocked({
      roomId: transactionResult.lockedRoom.id,
      lockedAt: transactionResult.lockedRoom.locked_at,
      deleteAfter: transactionResult.lockedRoom.delete_after,
    });
  }

  return getExistingBookingForUser(bookingId, actorUserId);
}

export async function completeBooking(bookingId: string, actorUserId: string, reason?: string) {
  const transactionResult = await withTransaction(async (client) => {
    const booking = await bookingsRepo.findBookingForUpdate(bookingId, client);

    if (!booking) {
      throw new AppError(404, "Booking not found", "BOOKING_NOT_FOUND");
    }

    if (booking.driver_id !== actorUserId) {
      throw new AppError(403, "Only the driver can complete this booking", "FORBIDDEN");
    }

    if (booking.status !== "confirmed") {
      throw new AppError(
        409,
        "Only confirmed bookings can be completed",
        "BOOKING_COMPLETE_INVALID_STATUS",
      );
    }

    await bookingsRepo.updateBookingLifecycle(
      {
        bookingId,
        status: "completed",
        expiresAt: null,
        completedAt: booking.completed_at ? undefined : new Date(),
      },
      client,
    );

    await bookingsRepo.insertBookingStatusEvent(
      {
        bookingId,
        fromStatus: booking.status,
        toStatus: "completed",
        actorUserId,
        reason,
        metadata: {
          bookingFlow: getBookingFlow(booking),
          paymentState: booking.payment_state,
        },
      },
      client,
    );

    const lockedRoom = await chatService.lockRoomForTerminalBooking(bookingId, client);
    const settlementOpened = await settlementsService.openSettlementForCompletedBooking(
      booking,
      client,
    );

    return {
      lockedRoom,
      settlementOpened,
    };
  });

  try {
    await cancelBookingExpiry(bookingId);
  } catch (error) {
    logger.warn({ error, bookingId }, "Failed to remove booking expiry job after completion");
  }

  if (transactionResult.settlementOpened) {
    try {
      await settlementsService.afterSettlementOpened(transactionResult.settlementOpened);
    } catch (error) {
      logger.warn(
        { error, bookingId, settlementId: transactionResult.settlementOpened.settlementId },
        "Post-completion settlement follow-up failed",
      );
    }
  }

  if (transactionResult.lockedRoom) {
    emitChatRoomLocked({
      roomId: transactionResult.lockedRoom.id,
      lockedAt: transactionResult.lockedRoom.locked_at,
      deleteAfter: transactionResult.lockedRoom.delete_after,
    });
  }

  return getExistingBookingForUser(bookingId, actorUserId);
}

export function updateBookingStatusLegacy(
  actorUserId: string,
  input: UpdateBookingStatusLegacyInput,
) {
  switch (input.new_status) {
    case "confirmed":
      return confirmBooking(input.booking_id, actorUserId, input.reason);
    case "cancelled":
      return cancelBooking(input.booking_id, actorUserId, input.reason);
    case "completed":
      return completeBooking(input.booking_id, actorUserId, input.reason);
    default:
      throw new AppError(400, "Unsupported booking transition", "BOOKING_TRANSITION_INVALID");
  }
}
