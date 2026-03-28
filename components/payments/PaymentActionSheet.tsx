"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type PaymentActionSheetOption = {
  label: string;
  value: string;
  description: string;
};

type PaymentActionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  options: PaymentActionSheetOption[];
  confirmLabel: string;
  loading: boolean;
  onConfirm: (value: string) => Promise<void>;
};

export default function PaymentActionSheet({
  open,
  onOpenChange,
  title,
  description,
  options,
  confirmLabel,
  loading,
  onConfirm,
}: PaymentActionSheetProps) {
  const [selected, setSelected] = useState<string>(options[0]?.value ?? "");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="space-y-2 px-4 pb-2">
          {options.map((option) => {
            const active = selected === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelected(option.value)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border/70 bg-card hover:bg-muted/50"
                }`}
              >
                <p className="text-sm font-medium text-foreground">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </button>
            );
          })}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            disabled={loading || !selected}
            onClick={() => void onConfirm(selected)}
          >
            {loading ? "Please wait..." : confirmLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
