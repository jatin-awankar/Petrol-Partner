"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";

import Icon from "../AppIcon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "../ui/drawer";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: any;
  mode: "offer" | "request";
  onPublish: () => void;
}

const checklistBase = [
  "Pickup and drop locations selected",
  "Date and time confirmed",
  "Price per seat set",
];

const PreviewBody = ({
  formData,
  mode,
}: {
  formData: any;
  mode: "offer" | "request";
}) => {
  const checklist = useMemo(
    () =>
      mode === "offer"
        ? [...checklistBase, "Approved vehicle selected"]
        : checklistBase,
    [mode],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
        <div className="rounded-lg border border-border/70 bg-sky-500/[0.06] p-3">
          <p className="text-xs text-muted-foreground">Pickup</p>
          <p className="mt-1 text-sm text-foreground">
            {formData.route.pickup || "-"}
          </p>
        </div>
        <div className="rounded-lg border border-border/70 bg-sky-500/[0.06] p-3">
          <p className="text-xs text-muted-foreground">Dropoff</p>
          <p className="mt-1 text-sm text-foreground">
            {formData.route.dropoff || "-"}
          </p>
        </div>
        <div className="rounded-lg border border-border/70 bg-violet-500/[0.06] p-3">
          <p className="text-xs text-muted-foreground">Date and time</p>
          <p className="mt-1 text-sm text-foreground">
            {formData.schedule.date || "-"} {formData.schedule.time || ""}
          </p>
        </div>
        <div className="rounded-lg border border-border/70 bg-violet-500/[0.06] p-3">
          <p className="text-xs text-muted-foreground">
            {mode === "offer" ? "Available seats" : "Seats needed"}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {mode === "offer"
              ? formData.availableSeats
              : formData.seatsRequired}
          </p>
        </div>
      </div>

      {mode === "offer" ? (
        <div className="rounded-lg border border-border/70 bg-emerald-500/[0.06] p-3">
          <p className="text-xs text-muted-foreground">Vehicle</p>
          <p className="mt-1 text-sm text-foreground">
            {formData.vehicle.make} {formData.vehicle.model}
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-border/70 bg-amber-500/[0.06] p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Price per seat</p>
          <Badge variant="secondary">
            ₹ {formData.pricing.farePerSeat || 0}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Preference: {formData.preferences.gender || "any"}
        </p>
      </div>

      <div className="rounded-lg border border-border/70 p-3">
        <p className="text-sm font-semibold text-foreground mb-2">Checklist</p>
        <ul className="space-y-1">
          {checklist.map((item) => (
            <li
              key={item}
              className="text-sm text-muted-foreground flex items-center gap-2"
            >
              <Icon name="CheckCircle2" size={14} className="text-success" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const PreviewModal: React.FC<PreviewModalProps> = ({
  isOpen,
  onClose,
  formData,
  mode,
  onPublish,
}) => {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => (!open ? onClose() : null)}>
        <DrawerContent className="max-h-[88vh] mb-16 md:mb-auto">
          <DrawerHeader>
            <DrawerTitle>
              {mode === "offer" ? "Review offer" : "Review request"}
            </DrawerTitle>
            <DrawerDescription>
              Final check before publishing.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-3 sm:px-4 pb-2 overflow-y-auto">
            <PreviewBody formData={formData} mode={mode} />
          </div>
          <DrawerFooter>
            <Button variant="outline" className="w-full" onClick={onClose}>
              Edit
            </Button>
            <Button className="w-full" onClick={onPublish}>
              {mode === "offer" ? "Publish Offer" : "Publish Request"}
              <Send />
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="max-w-2xl mx-3 sm:mx-0">
        <DialogHeader>
          <DialogTitle>
            {mode === "offer" ? "Review ride offer" : "Review ride request"}
          </DialogTitle>
          <DialogDescription>Confirm details and publish.</DialogDescription>
        </DialogHeader>

        <PreviewBody formData={formData} mode={mode} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onClose}
          >
            Edit
          </Button>
          <Button className="w-full sm:w-auto" onClick={onPublish}>
            {mode === "offer" ? "Publish Offer" : "Publish Request"}
            <Send />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PreviewModal;
