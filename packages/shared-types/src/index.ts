export type UserRole = "user" | "driver" | "admin";
export type GenderForMatching = "female" | "male";
export type CounterpartyGenderPreference = "any" | "female_only" | "male_only";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "completed";

export type PaymentState =
  | "unpaid"
  | "order_created"
  | "verification_pending"
  | "paid_escrow"
  | "failed"
  | "refund_pending"
  | "refunded"
  | "cancelled";

export type BookingFlow = "offer" | "request";
export type StudentVerificationStatus =
  | "pending_consent"
  | "verified"
  | "revalidation_due"
  | "expired"
  | "suspended";

export type DriverEligibilityStatus =
  | "not_started"
  | "pending_review"
  | "approved"
  | "expiring"
  | "expired"
  | "suspended"
  | "rejected";

export type PricingAreaType = "metro" | "urban" | "rural";

export type SettlementStatus =
  | "not_due"
  | "due"
  | "passenger_marked_paid"
  | "settled"
  | "overdue"
  | "disputed"
  | "waived";

export type OutstandingBalanceStatus = "open" | "under_review" | "cleared" | "waived";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
}
