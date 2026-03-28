"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInrFromPaise, PaymentCardViewModel } from "@/lib/payments/view-model";
import { formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";

import PaymentStateBadge from "./PaymentStateBadge";

type PaymentBookingCardProps = {
  card: PaymentCardViewModel;
  loading: boolean;
  onPayOnline: () => void;
  onOpenMarkPaidSheet: () => void;
  onOpenConfirmReceiptSheet: () => void;
  onRefresh: () => void;
};

function paymentMethodLabel(value: string | null) {
  if (!value) return "Not selected";
  return value.toUpperCase();
}

export default function PaymentBookingCard({
  card,
  loading,
  onPayOnline,
  onOpenMarkPaidSheet,
  onOpenConfirmReceiptSheet,
  onRefresh,
}: PaymentBookingCardProps) {
  const [date, time] = card.scheduleLabel.split(" ");

  return (
    <Card className="animate-in fade-in-0 gap-4 rounded-2xl border-border/70 bg-card/90 shadow-card transition-all duration-200 hover:shadow-soft">
      <CardHeader className="px-4 pt-4 sm:px-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {card.routeLabel}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatUtcToTodayOrDayMonth(date)} at {formatTimeToAmPm(time)}
            </p>
            <p className="text-sm text-muted-foreground">{card.counterpartLabel}</p>
          </div>

          <div className="space-y-2 md:text-right">
            <p className="text-xl font-semibold text-foreground">
              {formatInrFromPaise(card.amountPaise)}
            </p>
            <PaymentStateBadge
              settlementStatus={card.settlementStatus}
              paymentState={card.paymentState}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 px-4 sm:px-5 md:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Settlement</p>
          <p className="mt-1 text-sm font-medium text-foreground">{card.settlementStatus}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Payment State</p>
          <p className="mt-1 text-sm font-medium text-foreground">{card.paymentState}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Method</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {paymentMethodLabel(card.preferredPaymentMethod)}
          </p>
        </div>
      </CardContent>

      <div className="px-4 sm:px-5">
        <p className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-muted-foreground">
          {card.statusHint}
        </p>
      </div>

      <CardFooter className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-border/70 bg-card/95 px-4 py-3 backdrop-blur sm:px-5">
        {card.canPayOnline ? (
          <Button onClick={onPayOnline} disabled={loading}>
            {loading ? "Processing..." : "Pay Online"}
          </Button>
        ) : null}

        {card.canMarkOfflinePaid ? (
          <Button variant="outline" onClick={onOpenMarkPaidSheet} disabled={loading}>
            Mark Offline Paid
          </Button>
        ) : null}

        {card.canConfirmOffline ? (
          <Button variant="outline" onClick={onOpenConfirmReceiptSheet} disabled={loading}>
            Confirm Receipt
          </Button>
        ) : null}

        <Button variant="ghost" onClick={onRefresh} disabled={loading} className="ml-auto">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardFooter>
    </Card>
  );
}
