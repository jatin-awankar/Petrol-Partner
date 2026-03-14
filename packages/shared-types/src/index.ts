export type UserRole = "user" | "driver" | "admin";

export type BookingStatus =
  | "pending_payment"
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
  | "refunded";

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
