"use client";

import React, { useMemo } from "react";

import Icon from "../AppIcon";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";

interface PricingSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
  errors: Record<string, string>;
  mode?: "offer" | "request";
}

const paymentMethods = [
  { id: "upi", label: "UPI", icon: "Smartphone" },
  { id: "cash", label: "Cash", icon: "Banknote" },
  { id: "card", label: "Card", icon: "CreditCard" },
];

const PricingSection: React.FC<PricingSectionProps> = ({
  formData,
  updateFormData,
  errors,
  mode = "offer",
}) => {
  const seats = mode === "offer" ? Number(formData.availableSeats || 0) : Number(formData.seatsRequired || 0);
  const fare = Number(formData.pricing.farePerSeat || 0);

  const gross = useMemo(() => (mode === "offer" ? fare * seats : fare * seats), [fare, mode, seats]);
  const estimatedNet = useMemo(() => (mode === "offer" ? Math.max(0, gross - Math.ceil(gross * 0.05)) : gross), [gross, mode]);

  const setFare = (value: number) => {
    updateFormData({
      ...formData,
      pricing: {
        ...formData.pricing,
        farePerSeat: value,
      },
    });
  };

  const togglePaymentMethod = (method: string) => {
    const current = formData.pricing.paymentMethods || [];
    const next = current.includes(method)
      ? current.filter((item: string) => item !== method)
      : [...current, method];

    updateFormData({
      ...formData,
      pricing: {
        ...formData.pricing,
        paymentMethods: next,
      },
    });
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
            <Icon name="IndianRupee" size={18} className="text-primary" />
            Pricing
          </h3>
          <Badge variant="outline">{mode === "offer" ? "You set fare" : "Your max budget"}</Badge>
        </div>

        <div className="space-y-2">
          <Label>{mode === "offer" ? "Fare per seat (₹)" : "Max price per seat (₹)"}</Label>
          <Input
            type="number"
            min={1}
            value={formData.pricing.farePerSeat}
            onChange={(e) => setFare(Number(e.target.value) || 0)}
            placeholder="Enter amount"
          />
          {errors.farePerSeat ? <p className="text-xs text-destructive">{errors.farePerSeat}</p> : null}
        </div>
      </div>

      <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4 md:p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">
          {mode === "offer" ? "Estimated payout summary" : "Estimated spend summary"}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Seats</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{seats}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Gross amount</p>
            <p className="mt-1 text-sm font-semibold text-foreground">₹ {gross || 0}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">
              {mode === "offer" ? "Estimated net" : "Estimated total"}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">₹ {estimatedNet || 0}</p>
          </div>
        </div>
      </div>

      {mode === "offer" ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 md:p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">Accepted payment modes</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {paymentMethods.map((method) => {
              const active = formData.pricing.paymentMethods?.includes(method.id);
              return (
                <Button
                  key={method.id}
                  variant={active ? "default" : "outline"}
                  className="justify-start w-full"
                  onClick={() => togglePaymentMethod(method.id)}
                >
                  <Icon name={method.icon} size={16} />
                  {method.label}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PricingSection;
