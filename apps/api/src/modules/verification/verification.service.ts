import { withTransaction } from "../../db/transaction";
import { insertAuditLog } from "../../shared/audit/logs";
import { AppError } from "../../shared/errors/app-error";
import type {
  CreateVehicleInput,
  PendingVerificationReviewsQuery,
  ReviewDriverEligibilityInput,
  ReviewStudentVerificationInput,
  ReviewVehicleInput,
  UpdateVehicleInput,
  UpsertDriverEligibilityInput,
  UpsertStudentVerificationInput,
} from "./verification.schema";
import * as verificationRepo from "./verification.repo";

const ACTIVE_STUDENT_STATUSES = new Set(["verified", "revalidation_due"]);

function deriveEligibilityEndsAt(input: UpsertStudentVerificationInput) {
  if (input.eligibility_ends_at) {
    return new Date(input.eligibility_ends_at);
  }

  return new Date(Date.UTC(input.graduation_year, 11, 31, 23, 59, 59));
}

function deriveRevalidateAfter(input: UpsertStudentVerificationInput, eligibilityEndsAt: Date) {
  if (input.revalidate_after) {
    return new Date(input.revalidate_after);
  }

  const sixMonthsFromNow = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  return sixMonthsFromNow < eligibilityEndsAt ? sixMonthsFromNow : eligibilityEndsAt;
}

function deriveStudentVerificationStatus(eligibilityEndsAt: Date) {
  return eligibilityEndsAt > new Date() ? "pending_review" : "expired";
}

function deriveDriverEligibilityStatus(input: UpsertDriverEligibilityInput) {
  const today = new Date();
  const licenseExpiry = new Date(`${input.license_expires_at}T00:00:00.000Z`);
  const insuranceExpiry = input.insurance_expires_at
    ? new Date(`${input.insurance_expires_at}T00:00:00.000Z`)
    : null;
  const pucExpiry = input.puc_expires_at
    ? new Date(`${input.puc_expires_at}T00:00:00.000Z`)
    : null;

  if (
    licenseExpiry <= today ||
    (insuranceExpiry && insuranceExpiry <= today) ||
    (pucExpiry && pucExpiry <= today)
  ) {
    return "expired";
  }

  return "pending_review";
}

function ensureDriverEligibilityFields(
  current: Awaited<ReturnType<typeof verificationRepo.findDriverEligibilityByUserId>>,
) {
  if (!current?.license_number_last4 || !current.license_expires_at) {
    throw new AppError(
      409,
      "Driver eligibility submission is incomplete and cannot be reviewed",
      "DRIVER_ELIGIBILITY_INCOMPLETE",
    );
  }

  return current as NonNullable<typeof current> & {
    license_number_last4: string;
    license_expires_at: string;
  };
}

function ensureStudentVerificationFields(
  current: Awaited<ReturnType<typeof verificationRepo.findStudentVerificationByUserId>>,
) {
  if (!current?.admission_year || !current?.graduation_year) {
    throw new AppError(
      409,
      "Student verification submission is incomplete and cannot be reviewed",
      "STUDENT_VERIFICATION_INCOMPLETE",
    );
  }

  return current as NonNullable<typeof current> & {
    admission_year: number;
    graduation_year: number;
    eligibility_ends_at: string;
  };
}

export async function getOverview(userId: string) {
  const [studentVerification, driverEligibility, vehicles] = await Promise.all([
    verificationRepo.findStudentVerificationByUserId(userId),
    verificationRepo.findDriverEligibilityByUserId(userId),
    verificationRepo.listVehiclesByOwner(userId),
  ]);

  return {
    student_verification: studentVerification,
    driver_eligibility: driverEligibility,
    vehicles,
  };
}

export function getStudentVerification(userId: string) {
  return verificationRepo.findStudentVerificationByUserId(userId);
}

export async function upsertStudentVerification(
  userId: string,
  input: UpsertStudentVerificationInput,
) {
  const eligibilityEndsAt = deriveEligibilityEndsAt(input);
  const eligibilityStartsAt = input.eligibility_starts_at
    ? new Date(input.eligibility_starts_at)
    : null;
  const revalidateAfter = deriveRevalidateAfter(input, eligibilityEndsAt);
  const status = deriveStudentVerificationStatus(eligibilityEndsAt);

  return withTransaction(async (client) => {
    const studentVerification = await verificationRepo.upsertStudentVerification(
      {
        userId,
        provider: input.provider,
        status,
        studentIdentifierLast4: input.student_identifier_last4 ?? null,
        institutionName: input.institution_name,
        programName: input.program_name ?? null,
        admissionYear: input.admission_year,
        graduationYear: input.graduation_year,
        verifiedAt: null,
        reviewedByUserId: null,
        reviewedAt: null,
        eligibilityStartsAt,
        eligibilityEndsAt,
        revalidateAfter,
        consentReference: input.consent_reference ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          submissionSource: "self_service",
          submittedAt: new Date().toISOString(),
        },
      },
      client,
    );

    await verificationRepo.syncUserVerificationProfile(
      {
        userId,
        isVerified: false,
        college: null,
        genderForMatching: input.gender_for_matching ?? null,
      },
      client,
    );

    return studentVerification;
  });
}

export function getDriverEligibility(userId: string) {
  return verificationRepo.findDriverEligibilityByUserId(userId);
}

export function upsertDriverEligibility(userId: string, input: UpsertDriverEligibilityInput) {
  const status = deriveDriverEligibilityStatus(input);

  return withTransaction(async (client) => {
    return verificationRepo.upsertDriverEligibility(
      {
        userId,
        status,
        licenseNumberLast4: input.license_number_last4,
        licenseExpiresAt: input.license_expires_at,
        insuranceExpiresAt: input.insurance_expires_at ?? null,
        pucExpiresAt: input.puc_expires_at ?? null,
        lastVerifiedAt: null,
        approvedAt: null,
        reviewedByUserId: null,
        reviewedAt: null,
        metadata: {
          ...(input.metadata ?? {}),
          submissionSource: "self_service",
          submittedAt: new Date().toISOString(),
        },
      },
      client,
    );
  });
}

export function listVehicles(userId: string) {
  return verificationRepo.listVehiclesByOwner(userId);
}

export function createVehicle(userId: string, input: CreateVehicleInput) {
  return withTransaction(async (client) => {
    return verificationRepo.createVehicle(
      {
        ownerUserId: userId,
        vehicleType: input.vehicle_type,
        make: input.make ?? null,
        model: input.model ?? null,
        color: input.color ?? null,
        registrationNumberLast4: input.registration_number_last4,
        seatCapacity: input.seat_capacity,
        metadata: {
          ...(input.metadata ?? {}),
          submissionSource: "self_service",
        },
      },
      client,
    );
  });
}

export async function updateVehicle(userId: string, vehicleId: string, input: UpdateVehicleInput) {
  const current = await verificationRepo.findVehicleByIdForOwner(userId, vehicleId);

  if (!current) {
    throw new AppError(404, "Vehicle not found", "VEHICLE_NOT_FOUND");
  }

  return withTransaction(async (client) => {
    const vehicle = await verificationRepo.updateVehicle(
      {
        ownerUserId: userId,
        vehicleId,
        vehicleType: input.vehicle_type ?? current.vehicle_type,
        make: input.make ?? current.make,
        model: input.model ?? current.model,
        color: input.color ?? current.color,
        registrationNumberLast4:
          input.registration_number_last4 ?? current.registration_number_last4,
        seatCapacity: input.seat_capacity ?? current.seat_capacity,
        status: current.status,
        verificationStatus: current.verification_status,
        reviewedByUserId: current.reviewed_by_user_id,
        reviewedAt: current.reviewed_at ? new Date(current.reviewed_at) : null,
        metadata: {
          ...(current.metadata ?? {}),
          ...(input.metadata ?? {}),
        },
      },
      client,
    );

    if (!vehicle) {
      throw new AppError(404, "Vehicle not found", "VEHICLE_NOT_FOUND");
    }

    return vehicle;
  });
}

export async function assertVerifiedStudentCanTransact(userId: string) {
  const eligibility = await verificationRepo.findTransactionEligibilityByUserId(userId);

  if (!eligibility?.student_verification_status) {
    throw new AppError(
      403,
      "Student verification is required before using transactional features",
      "STUDENT_VERIFICATION_REQUIRED",
    );
  }

  const eligibilityEndsAt = eligibility.student_eligibility_ends_at
    ? new Date(eligibility.student_eligibility_ends_at)
    : null;

  if (
    !ACTIVE_STUDENT_STATUSES.has(eligibility.student_verification_status) ||
    (eligibilityEndsAt && eligibilityEndsAt <= new Date())
  ) {
    throw new AppError(
      403,
      "Only verified students within their eligibility window can transact",
      "STUDENT_VERIFICATION_INACTIVE",
      {
        status: eligibility.student_verification_status,
        eligibility_ends_at: eligibilityEndsAt?.toISOString() ?? null,
      },
    );
  }
}

export async function assertApprovedDriverCanOfferRide(userId: string, vehicleId?: string | null) {
  await assertVerifiedStudentCanTransact(userId);

  const eligibility = await verificationRepo.findTransactionEligibilityByUserId(userId);

  if (eligibility?.driver_eligibility_status !== "approved") {
    throw new AppError(
      403,
      "Approved driver eligibility is required before creating ride offers",
      "DRIVER_ELIGIBILITY_NOT_APPROVED",
      {
        status: eligibility?.driver_eligibility_status ?? null,
      },
    );
  }

  if (!vehicleId) {
    throw new AppError(
      400,
      "An approved vehicle is required before creating a ride offer",
      "VEHICLE_REQUIRED_FOR_RIDE_OFFER",
    );
  }

  const vehicle = await verificationRepo.findApprovedVehicleForOwner(userId, vehicleId);

  if (!vehicle) {
    throw new AppError(
      403,
      "Only approved active vehicles can be used for ride offers",
      "VEHICLE_NOT_APPROVED",
      {
        vehicle_id: vehicleId,
      },
    );
  }

  return vehicle;
}

export async function listPendingReviews(query: PendingVerificationReviewsQuery) {
  const [studentVerifications, driverEligibility, vehicles] = await Promise.all([
    verificationRepo.listPendingStudentVerifications(query.limit),
    verificationRepo.listPendingDriverEligibilityReviews(query.limit),
    verificationRepo.listPendingVehicleReviews(query.limit),
  ]);

  return {
    student_verifications: studentVerifications,
    driver_eligibility: driverEligibility,
    vehicles,
  };
}

export async function reviewStudentVerification(
  adminUserId: string,
  userId: string,
  input: ReviewStudentVerificationInput,
) {
  const current = ensureStudentVerificationFields(
    await verificationRepo.findStudentVerificationByUserId(userId),
  );

  return withTransaction(async (client) => {
    const reviewedAt = new Date();
    const reviewed = await verificationRepo.upsertStudentVerification(
      {
        userId,
        provider: current.provider,
        status: input.outcome,
        studentIdentifierLast4: current.student_identifier_last4,
        institutionName: current.institution_name,
        programName: current.program_name,
        admissionYear: current.admission_year,
        graduationYear: current.graduation_year,
        verifiedAt: input.outcome === "verified" ? reviewedAt : null,
        reviewedByUserId: adminUserId,
        reviewedAt,
        eligibilityStartsAt: current.eligibility_starts_at
          ? new Date(current.eligibility_starts_at)
          : null,
        eligibilityEndsAt: new Date(current.eligibility_ends_at),
        revalidateAfter: current.revalidate_after ? new Date(current.revalidate_after) : null,
        consentReference: current.consent_reference,
        metadata: {
          ...(current.metadata ?? {}),
          reviewReason: input.reason ?? null,
        },
      },
      client,
    );

    await verificationRepo.syncUserVerificationProfile(
      {
        userId,
        isVerified: input.outcome === "verified",
        college: input.outcome === "verified" ? current.institution_name : null,
        genderForMatching: null,
      },
      client,
    );

    await insertAuditLog(
      {
        actorUserId: adminUserId,
        action: "student_verification_reviewed",
        entityType: "student_verification",
        entityId: reviewed.id,
        metadata: {
          outcome: input.outcome,
          reviewedUserId: userId,
          reason: input.reason ?? null,
        },
      },
      client,
    );

    return reviewed;
  });
}

export async function reviewDriverEligibility(
  adminUserId: string,
  userId: string,
  input: ReviewDriverEligibilityInput,
) {
  const current = ensureDriverEligibilityFields(
    await verificationRepo.findDriverEligibilityByUserId(userId),
  );

  const nextStatus =
    input.outcome === "approved" ? "approved" : input.outcome === "suspended" ? "suspended" : "rejected";

  return withTransaction(async (client) => {
    const reviewedAt = new Date();
    const reviewed = await verificationRepo.upsertDriverEligibility(
      {
        userId,
        status: nextStatus,
        licenseNumberLast4: current.license_number_last4,
        licenseExpiresAt: current.license_expires_at,
        insuranceExpiresAt: current.insurance_expires_at,
        pucExpiresAt: current.puc_expires_at,
        lastVerifiedAt: nextStatus === "approved" ? reviewedAt : null,
        approvedAt: nextStatus === "approved" ? reviewedAt : null,
        reviewedByUserId: adminUserId,
        reviewedAt,
        metadata: {
          ...(current.metadata ?? {}),
          reviewReason: input.reason ?? null,
        },
      },
      client,
    );

    await insertAuditLog(
      {
        actorUserId: adminUserId,
        action: "driver_eligibility_reviewed",
        entityType: "driver_eligibility",
        entityId: userId,
        metadata: {
          outcome: nextStatus,
          reason: input.reason ?? null,
        },
      },
      client,
    );

    return reviewed;
  });
}

export async function reviewVehicle(
  adminUserId: string,
  vehicleId: string,
  input: ReviewVehicleInput,
) {
  const current = await verificationRepo.findVehicleById(vehicleId);

  if (!current) {
    throw new AppError(404, "Vehicle not found", "VEHICLE_NOT_FOUND");
  }

  const verificationStatus = input.outcome === "approved" ? "approved" : "rejected";
  const status =
    input.outcome === "approved" ? "active" : input.outcome === "suspended" ? "suspended" : "inactive";

  return withTransaction(async (client) => {
    const reviewed = await verificationRepo.updateVehicle(
      {
        ownerUserId: current.owner_user_id,
        vehicleId,
        vehicleType: current.vehicle_type,
        make: current.make,
        model: current.model,
        color: current.color,
        registrationNumberLast4: current.registration_number_last4,
        seatCapacity: current.seat_capacity,
        status,
        verificationStatus,
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
        metadata: {
          ...(current.metadata ?? {}),
          reviewReason: input.reason ?? null,
        },
      },
      client,
    );

    if (!reviewed) {
      throw new AppError(404, "Vehicle not found", "VEHICLE_NOT_FOUND");
    }

    await insertAuditLog(
      {
        actorUserId: adminUserId,
        action: "vehicle_reviewed",
        entityType: "vehicle",
        entityId: vehicleId,
        metadata: {
          outcome: input.outcome,
          ownerUserId: current.owner_user_id,
          reason: input.reason ?? null,
        },
      },
      client,
    );

    return reviewed;
  });
}
