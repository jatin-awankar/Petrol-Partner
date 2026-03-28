"use client";

import { AlertCircle, CircleCheckBig, Clock3, Wallet } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { FinancialHoldView, formatInrFromPaise, PaymentSummary } from "@/lib/payments/view-model";

type PaymentsSummaryStripProps = {
  summary: PaymentSummary;
  hold: FinancialHoldView | null;
};

export default function PaymentsSummaryStrip({
  summary,
  hold,
}: PaymentsSummaryStripProps) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="border-sky-200/70 bg-gradient-to-br from-sky-50 to-cyan-50 shadow-card">
        <CardContent className="px-4 py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Due</p>
              <p className="mt-2 text-xl font-semibold text-sky-900">
                {formatInrFromPaise(summary.dueAmountPaise)}
              </p>
              <p className="mt-1 text-sm text-sky-800/80">{summary.dueCount} bookings</p>
            </div>
            <Clock3 className="size-4 text-sky-700" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-rose-200/70 bg-gradient-to-br from-rose-50 to-orange-50 shadow-card">
        <CardContent className="px-4 py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Overdue</p>
              <p className="mt-2 text-xl font-semibold text-rose-900">
                {formatInrFromPaise(summary.overdueAmountPaise)}
              </p>
              <p className="mt-1 text-sm text-rose-800/80">{summary.overdueCount} bookings</p>
            </div>
            <AlertCircle className="size-4 text-rose-700" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-green-50 shadow-card">
        <CardContent className="px-4 py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Settled</p>
              <p className="mt-2 text-xl font-semibold text-emerald-900">{summary.settledCount}</p>
              <p className="mt-1 text-sm text-emerald-800/80">completed transactions</p>
            </div>
            <CircleCheckBig className="size-4 text-emerald-700" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-violet-200/70 bg-gradient-to-br from-violet-50 to-indigo-50 shadow-card">
        <CardContent className="px-4 py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Financial Hold</p>
              <p className="mt-2 text-xl font-semibold text-violet-900">
                {hold?.hasFinancialHold ? "Active" : "Clear"}
              </p>
              <p className="mt-1 text-sm text-violet-800/80">
                {formatInrFromPaise(hold?.totalOutstandingPaise ?? 0)}
              </p>
            </div>
            <Wallet className="size-4 text-violet-700" />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
