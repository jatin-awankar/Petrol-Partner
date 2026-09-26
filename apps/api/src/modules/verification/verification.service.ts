import { withTransaction } from "../../db/transaction";
import type { PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { insertAuditLog } from "../../shared/audit/logs";
import { AppError } from "../../shared/errors/app-error";
import { assertCurrentOperator } from "../operator/operator.authorization";
import { deleteEvidence, readEvidence, storeEvidence } from "./student-evidence.storage";
import type {
  CreateVehicleInput,
  PendingVerificationReviewsQuery,
  ReviewDriverEligibilityInput,
  ReviewVehicleInput,
  UpdateVehicleInput,
  UpsertDriverEligibilityInput,
  UpsertStudentVerificationInput,
} from "./verification.schema";
import * as verificationRepo from "./verification.repo";

const ACTIVE_STUDENT_STATUSES = new Set(["verified", "revalidation_due"]);

async function assertCurrentStudentForSubmission(client: PoolClient, userId: string) {
  const student = await verificationRepo.findStudentEligibilityForUpdate(client, userId);
  if (!student || !ACTIVE_STUDENT_STATUSES.has(student.status) ||
      student.adult_eligible !== true || new Date(student.eligibility_ends_at) <= new Date()) {
    throw new AppError(403, "Current student approval is required", "STUDENT_VERIFICATION_INACTIVE");
  }
}

function deriveEligibilityEndsAt(input: UpsertStudentVerificationInput) {
  return new Date(Date.UTC(input.graduation_year, 11, 31, 23, 59, 59));
}

function deriveRevalidateAfter(input: UpsertStudentVerificationInput, eligibilityEndsAt: Date) {
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
  if (!current?.admission_year || !current?.graduation_year ||
      !current.enrolled_name || !current.evidence_category || !current.age_evidence_category) {
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

export async function uploadStudentEvidence(userId: string, purpose: "enrollment" | "age", bytes: Buffer, contentType: string) {
  let createdKey: string | null = null;
  try {
    return await withTransaction(async (client) => {
      const submission = await verificationRepo.findStudentVerificationForUpdate(client, userId);
      if (submission?.status !== "pending_review") {
        throw new AppError(409, "Submit enrollment details before evidence", "STUDENT_SUBMISSION_REQUIRED");
      }
      const existing = await verificationRepo.studentEvidenceForUpdate(client, userId, purpose, submission.review_cycle);
      if (existing) {
        if (existing.status === "retained") throw new AppError(409, "Evidence has already been reviewed", "EVIDENCE_REVIEWED");
        if (existing.status === "pending_review") {
          try {
            await readEvidence(existing.object_key);
            throw new AppError(409, "Evidence is already available for review", "EVIDENCE_EXISTS");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
      }
      const stored = await storeEvidence(bytes, contentType);
      createdKey = stored.key;
      await verificationRepo.recordStudentEvidence(client, userId, purpose, submission.review_cycle, stored);
      return { status: "pending_review", uploaded_at: new Date().toISOString() };
    });
  } catch (error) {
    if (createdKey) await deleteEvidence(createdKey).catch(() => undefined);
    throw error;
  }
}

export async function grantStudentEvidenceAccess(adminUserId: string, userId: string, purpose: "enrollment" | "age") {
  const token = randomUUID();
  await withTransaction(async (client) => {
    await assertCurrentOperator(client, adminUserId);
    const submission = await verificationRepo.findStudentVerificationForUpdate(client, userId);
    if (submission?.status !== "pending_review") throw new AppError(404, "Evidence unavailable", "EVIDENCE_NOT_FOUND");
    const evidence = await verificationRepo.studentEvidenceForUpdate(client, userId, purpose, submission.review_cycle);
    if (!evidence || evidence.status !== "pending_review") throw new AppError(404, "Evidence unavailable", "EVIDENCE_NOT_FOUND");
    await verificationRepo.createEvidenceAccessGrant(client, createHash("sha256").update(token).digest("hex"), adminUserId, userId, evidence.id);
    await verificationRepo.recordEvidenceAccessAudit(client, adminUserId, userId, evidence.id, "student_evidence_access_granted");
  });
  return { token, expires_in_seconds: 300 };
}

export async function readStudentEvidence(adminUserId: string, userId: string, purpose: "enrollment" | "age", token: string) {
  return withTransaction(async (client) => {
    await assertCurrentOperator(client, adminUserId);
    const submission = await verificationRepo.findStudentVerificationForUpdate(client, userId);
    if (submission?.status !== "pending_review") throw new AppError(404, "Evidence unavailable", "EVIDENCE_NOT_FOUND");
    const evidence = await verificationRepo.studentEvidenceForUpdate(client, userId, purpose, submission.review_cycle);
    if (!evidence || evidence.status !== "pending_review") throw new AppError(404, "Evidence unavailable", "EVIDENCE_NOT_FOUND");
    if (!await verificationRepo.consumeEvidenceAccessGrant(client, createHash("sha256").update(token).digest("hex"), adminUserId, userId, evidence.id)) {
      throw new AppError(403, "Evidence link expired or already used", "EVIDENCE_ACCESS_EXPIRED");
    }
    const bytes = await readEvidence(evidence.object_key);
    if (bytes.length !== evidence.byte_count ||
        createHash("sha256").update(bytes).digest("hex") !== evidence.sha256) {
      throw new AppError(409, "Evidence integrity check failed", "EVIDENCE_LOST");
    }
    await verificationRepo.recordEvidenceAccessAudit(client, adminUserId, userId, evidence.id, "student_evidence_accessed");
    return { bytes, contentType: evidence.content_type };
  });
}

export async function studentEvidenceRetentionHealth(adminUserId: string) {
  return withTransaction(async (client) => {
    await assertCurrentOperator(client, adminUserId);
    return verificationRepo.evidenceRetentionHealth(client);
  });
}

export async function upsertStudentVerification(
  userId: string,
  input: UpsertStudentVerificationInput,
) {
  const eligibilityEndsAt = deriveEligibilityEndsAt(input);
  const eligibilityStartsAt = null;
  const revalidateAfter = deriveRevalidateAfter(input, eligibilityEndsAt);
  const status = deriveStudentVerificationStatus(eligibilityEndsAt);

  return withTransaction(async (client) => {
    const existing = await verificationRepo.findStudentVerificationForUpdate(client, userId);
    if (existing && existing.status !== "pending_review" && existing.status !== "rejected") {
      throw new AppError(409, "Reviewed eligibility cannot be replaced by self service", "STUDENT_REVIEW_CONFLICT");
    }
    if (existing?.status === "pending_review") {
      for (const purpose of ["enrollment", "age"] as const) {
        const previous = await verificationRepo.studentEvidenceForUpdate(client, userId, purpose, existing.review_cycle);
        if (previous) throw new AppError(409, "Submitted evidence cannot be changed during review", "EVIDENCE_EXISTS");
      }
    }
    const studentVerification = await verificationRepo.upsertStudentVerification(
      {
        userId,
        provider: input.provider,
        status,
        studentIdentifierLast4: null,
        enrolledName: input.enrolled_name,
        evidenceCategory: input.evidence_category,
        ageEvidenceCategory: input.age_evidence_category,
        reviewCycle: existing?.status === "rejected" ? existing.review_cycle + 1 : existing?.review_cycle ?? 1,
        adultEligible: null,
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
        consentReference: null,
        metadata: {
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
        genderForMatching: null,
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
    await assertCurrentStudentForSubmission(client, userId);
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
    await assertCurrentStudentForSubmission(client, userId);
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
    await assertCurrentStudentForSubmission(client, userId);
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
    eligibility.student_adult_eligible !== true ||
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

  if (eligibility?.driver_eligibility_status !== "approved" ||
      !eligibility.driver_license_expires_at ||
      eligibility.driver_license_expires_at <= new Date().toISOString().slice(0, 10)) {
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
