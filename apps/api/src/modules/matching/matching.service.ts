import { logger } from "../../config/logger";
import { withTransaction } from "../../db/transaction";
import { AppError } from "../../shared/errors/app-error";
import * as notificationsService from "../notifications/notifications.service";
import type { CandidateQuery, StoredMatchesQuery } from "./matching.schema";
import * as matchingRepo from "./matching.repo";

function buildReasons(match: {
  pickup_distance_km: number;
  drop_distance_km: number;
  departure_gap_minutes: number;
  score: number;
}) {
  return {
    pickup_distance_km: match.pickup_distance_km,
    drop_distance_km: match.drop_distance_km,
    departure_gap_minutes: match.departure_gap_minutes,
    score: match.score,
  };
}

export async function listOfferCandidates(
  userId: string,
  offerId: string,
  query: CandidateQuery,
) {
  const offer = await matchingRepo.findOwnedActiveOffer(userId, offerId);

  if (!offer) {
    throw new AppError(404, "Ride offer not found", "RIDE_OFFER_NOT_FOUND");
  }

  return matchingRepo.listOfferCandidates({
    offerId,
    limit: query.limit,
    maxPickupDistanceKm: query.max_pickup_distance_km,
    maxDropDistanceKm: query.max_drop_distance_km,
    maxTimeGapMinutes: query.max_time_gap_minutes,
    minScore: query.min_score,
  });
}

export async function listRequestCandidates(
  userId: string,
  requestId: string,
  query: CandidateQuery,
) {
  const request = await matchingRepo.findOwnedActiveRequest(userId, requestId);

  if (!request) {
    throw new AppError(404, "Ride request not found", "RIDE_REQUEST_NOT_FOUND");
  }

  return matchingRepo.listRequestCandidates({
    requestId,
    limit: query.limit,
    maxPickupDistanceKm: query.max_pickup_distance_km,
    maxDropDistanceKm: query.max_drop_distance_km,
    maxTimeGapMinutes: query.max_time_gap_minutes,
    minScore: query.min_score,
  });
}

export async function listStoredMatches(userId: string, query: StoredMatchesQuery) {
  const result = await matchingRepo.listStoredMatchesForUser({
    userId,
    limit: query.limit,
    offset: query.offset,
    status: query.status,
  });

  return {
    matches: result.matches,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      count: result.matches.length,
      total: result.totalCount,
    },
  };
}

export async function refreshMatchesForUser(userId: string) {
  const activeRideIds = await matchingRepo.findActiveRideIdsByUser(userId);
  const computedCandidates = new Map<
    string,
    Awaited<ReturnType<typeof matchingRepo.listOfferCandidates>>[number]
  >();

  const [offerCandidateLists, requestCandidateLists] = await Promise.all([
    Promise.all(
      activeRideIds.offerIds.map((offerId) =>
        matchingRepo.listOfferCandidates({
          offerId,
          limit: 10,
          maxPickupDistanceKm: 5,
          maxDropDistanceKm: 10,
          maxTimeGapMinutes: 90,
          minScore: 10,
        }),
      ),
    ),
    Promise.all(
      activeRideIds.requestIds.map((requestId) =>
        matchingRepo.listRequestCandidates({
          requestId,
          limit: 10,
          maxPickupDistanceKm: 5,
          maxDropDistanceKm: 10,
          maxTimeGapMinutes: 90,
          minScore: 10,
        }),
      ),
    ),
  ]);

  for (const candidateList of [...offerCandidateLists, ...requestCandidateLists]) {
    for (const candidate of candidateList) {
      computedCandidates.set(
        `${candidate.ride_offer_id}:${candidate.ride_request_id}`,
        candidate,
      );
    }
  }

  await withTransaction(async (client) => {
    for (const offerId of activeRideIds.offerIds) {
      await matchingRepo.expireOfferMatches(offerId, client);
    }

    for (const requestId of activeRideIds.requestIds) {
      await matchingRepo.expireRequestMatches(requestId, client);
    }

    for (const candidate of computedCandidates.values()) {
      await matchingRepo.upsertMatchCandidate(
        {
          rideOfferId: candidate.ride_offer_id,
          rideRequestId: candidate.ride_request_id,
          status: "open",
          score: candidate.score,
          pickupDistanceKm: candidate.pickup_distance_km,
          dropDistanceKm: candidate.drop_distance_km,
          departureGapMinutes: candidate.departure_gap_minutes,
          reasons: buildReasons(candidate),
        },
        client,
      );
    }
  });

  let notificationsCreated = 0;

  for (const candidate of computedCandidates.values()) {
    const dedupeRoot = `${candidate.ride_offer_id}:${candidate.ride_request_id}`;

    const [offerOwnerNotification, requestOwnerNotification] = await Promise.all([
      notificationsService.createInAppNotification({
        userId: candidate.ride_offer.owner_user_id,
        type: "match_candidate_found",
        title: "Potential ride request match available",
        body: `A verified student ride request matches your route from ${candidate.ride_request.pickup_location} to ${candidate.ride_request.drop_location}.`,
        data: {
          ride_offer_id: candidate.ride_offer_id,
          ride_request_id: candidate.ride_request_id,
          score: candidate.score,
        },
        dedupeKey: `match-offer-owner:${dedupeRoot}`,
      }),
      notificationsService.createInAppNotification({
        userId: candidate.ride_request.owner_user_id,
        type: "match_candidate_found",
        title: "Potential ride offer match available",
        body: `A verified student ride offer matches your route from ${candidate.ride_offer.pickup_location} to ${candidate.ride_offer.drop_location}.`,
        data: {
          ride_offer_id: candidate.ride_offer_id,
          ride_request_id: candidate.ride_request_id,
          score: candidate.score,
        },
        dedupeKey: `match-request-owner:${dedupeRoot}`,
      }),
    ]);

    if (offerOwnerNotification || requestOwnerNotification) {
      notificationsCreated += 1;

      await withTransaction(async (client) => {
        await matchingRepo.markMatchCandidateNotified(
          candidate.ride_offer_id,
          candidate.ride_request_id,
          client,
        );
      });
    }
  }

  logger.info(
    {
      userId,
      offerCount: activeRideIds.offerIds.length,
      requestCount: activeRideIds.requestIds.length,
      matchCount: computedCandidates.size,
      notificationsCreated,
    },
    "Refreshed stored ride matches for user",
  );

  return {
    offer_count: activeRideIds.offerIds.length,
    request_count: activeRideIds.requestIds.length,
    match_count: computedCandidates.size,
    notifications_created: notificationsCreated,
  };
}

export function requestMatchRefresh(userId: string) {
  return matchingRepo.requestMatchingRefresh(userId);
}

export async function processPendingMatchRefreshRequests(limit = 10) {
  const claimedRequests = await matchingRepo.claimMatchingRefreshRequests(limit);
  let processed = 0;

  for (const request of claimedRequests) {
    try {
      await refreshMatchesForUser(request.user_id);
      await matchingRepo.completeMatchingRefreshRequest(request.user_id);
      processed += 1;
    } catch (error: any) {
      await matchingRepo.failMatchingRefreshRequest(
        request.user_id,
        error?.message ?? "matching_refresh_failed",
      );
      logger.error(
        {
          error,
          userId: request.user_id,
        },
        "Failed to process pending match refresh request",
      );
    }
  }

  return {
    claimed_count: claimedRequests.length,
    processed_count: processed,
  };
}
