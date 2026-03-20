import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/transaction", () => ({
  withTransaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>) => callback({})),
}));

vi.mock("../../shared/audit/logs", () => ({
  insertAuditLog: vi.fn(async () => undefined),
}));

vi.mock("./verification.repo", () => ({
  findTransactionEligibilityByUserId: vi.fn(),
  upsertStudentVerification: vi.fn(async () => ({
    id: "verification-1",
    user_id: "user-1",
    status: "pending_review",
  })),
  syncUserVerificationProfile: vi.fn(async () => undefined),
}));

import { AppError } from "../../shared/errors/app-error";
import * as verificationRepo from "./verification.repo";
import * as verificationService from "./verification.service";

describe("verification.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits student verification as pending review", async () => {
    const result = await verificationService.upsertStudentVerification("user-1", {
      provider: "manual_review",
      institution_name: "Example College",
      admission_year: 2024,
      graduation_year: 2028,
      gender_for_matching: "female",
    });

    expect(result).toMatchObject({
      id: "verification-1",
      status: "pending_review",
    });
    expect(verificationRepo.upsertStudentVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        status: "pending_review",
        verifiedAt: null,
        reviewedByUserId: null,
      }),
      expect.anything(),
    );
    expect(verificationRepo.syncUserVerificationProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        isVerified: false,
        college: null,
        genderForMatching: "female",
      }),
      expect.anything(),
    );
  });

  it("blocks transactions for unverified students", async () => {
    vi.mocked(verificationRepo.findTransactionEligibilityByUserId).mockResolvedValue({
      student_verification_status: "pending_review",
      student_eligibility_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      driver_eligibility_status: "pending_review",
    });

    await expect(verificationService.assertVerifiedStudentCanTransact("user-1")).rejects.toMatchObject({
      code: "STUDENT_VERIFICATION_INACTIVE",
    } satisfies Partial<AppError>);
  });

  it("allows transactions for verified students within eligibility", async () => {
    vi.mocked(verificationRepo.findTransactionEligibilityByUserId).mockResolvedValue({
      student_verification_status: "verified",
      student_eligibility_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      driver_eligibility_status: "approved",
    });

    await expect(
      verificationService.assertVerifiedStudentCanTransact("user-1"),
    ).resolves.toBeUndefined();
  });
});
