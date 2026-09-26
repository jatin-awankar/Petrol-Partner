import type { PoolClient } from "pg";
import { AppError } from "../../shared/errors/app-error";
import * as repo from "./commitment.repo";

function positiveMinutes(name: string) {
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 480) {
    throw new AppError(503, "Pilot commitment policy is unconfigured", "PILOT_POLICY_UNAVAILABLE");
  }
  return value;
}

export function corridorDeparture(date: string, time: string) {
  const value = new Date(`${date}T${time.length === 5 ? `${time}:00` : time.slice(0, 8)}+05:30`);
  if (Number.isNaN(value.getTime())) throw new AppError(400, "Departure time is invalid", "DEPARTURE_INVALID");
  return value;
}

export function assertWithinSupportWindow(now: Date) {
  const starts = process.env.PILOT_SUPPORT_WINDOW_START;
  const ends = process.env.PILOT_SUPPORT_WINDOW_END;
  if (!starts || !ends || Number.isNaN(Date.parse(starts)) || Number.isNaN(Date.parse(ends)) ||
      process.env.PILOT_SUPPORT_WINDOW_APPROVED !== "true") {
    throw new AppError(503, "Pilot support window is unconfigured", "SUPPORT_WINDOW_UNAVAILABLE");
  }
  if (now < new Date(starts) || now >= new Date(ends)) {
    throw new AppError(409, "Departure is outside the support window", "SUPPORT_WINDOW_CLOSED");
  }
}

export async function assertCommitmentsEligible(client: PoolClient, input: {
  driverId: string; vehicleId: string; passengerIds: string[];
  rideId: string | null; departureAt: Date;
}) {
  if (process.env.PILOT_CONFLICT_POLICY_APPROVED !== "true") {
    throw new AppError(503, "Pilot commitment policy is unapproved", "PILOT_POLICY_UNAVAILABLE");
  }
  const duration = positiveMinutes("PILOT_EXPECTED_TRIP_MINUTES") +
    positiveMinutes("PILOT_CONFLICT_BUFFER_MINUTES");
  const passengers = [...new Set(input.passengerIds)].sort();
  await repo.lockCommitmentActors(client, input.driverId, input.vehicleId, passengers);
  if (passengers.length) {
    const current = await repo.currentPassengers(client, passengers);
    if (current.length !== passengers.length) throw new AppError(403,
      "A passenger is no longer eligible", "PASSENGER_VERIFICATION_INACTIVE");
  }
  if (await repo.conflictingOffers(client, { ...input, passengerIds: [input.driverId, ...passengers],
    durationMinutes: duration })) {
    throw new AppError(409, "An overlapping ride commitment exists", "COMMITMENT_CONFLICT");
  }
}
