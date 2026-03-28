"use client";

import { Badge } from "@/components/ui/badge";

type PaymentStateBadgeProps = {
  settlementStatus: string;
  paymentState: string;
};

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function PaymentStateBadge({
  settlementStatus,
  paymentState,
}: PaymentStateBadgeProps) {
  if (paymentState === "verification_pending" || paymentState === "order_created") {
    return <Badge className="bg-amber-500 text-white">Verification Pending</Badge>;
  }

  if (paymentState === "paid_escrow" || settlementStatus === "settled") {
    return <Badge className="bg-emerald-600 text-white">Settled</Badge>;
  }

  if (paymentState === "failed") {
    return <Badge variant="destructive">Payment Failed</Badge>;
  }

  if (settlementStatus === "overdue") {
    return <Badge className="bg-rose-600 text-white">Overdue</Badge>;
  }

  if (settlementStatus === "due") {
    return <Badge className="bg-sky-600 text-white">Due</Badge>;
  }

  if (settlementStatus === "passenger_marked_paid") {
    return <Badge className="bg-indigo-600 text-white">Awaiting Confirmation</Badge>;
  }

  if (settlementStatus === "disputed") {
    return <Badge className="bg-orange-600 text-white">Disputed</Badge>;
  }

  if (settlementStatus === "waived") {
    return <Badge variant="secondary">Waived</Badge>;
  }

  return <Badge variant="outline">{humanize(settlementStatus)}</Badge>;
}
