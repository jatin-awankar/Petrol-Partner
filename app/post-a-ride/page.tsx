"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import Icon from "@/components/AppIcon";

import RouteSection from "@/components/postRide/RouteSection";
import DateTimeSection from "@/components/postRide/DateTimeSection";
import SeatsSection from "@/components/postRide/SeatsSection";
import VehicleSection from "@/components/postRide/VehicleSection";
import ProgressIndicator from "@/components/postRide/ProgressIndicator";
import PreviewModal from "@/components/postRide/PreviewModal";
import PricingSection from "@/components/postRide/PricingSection";
import PreferencesSection from "@/components/postRide/PreferencesSection";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Eye, Home, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useCreateRideOffer } from "@/hooks/rides/useRideOffers";
import { useSession } from "next-auth/react";

const STORAGE_KEY = "postRideFormData";

const PostRide = () => {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-card rounded-lg p-6 shadow-card text-center">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-sm text-muted-foreground">Loading your form...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  const { createRideOffer, loading } = useCreateRideOffer();
  const [currentStep, setCurrentStep] = useState(1);
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<any>({
    route: { pickup: "", dropoff: "", via: "" },
    schedule: {
      date: "",
      time: "",
      flexibility: 0,
      recurring: { enabled: false, days: [], endDate: "" },
    },
    availableSeats: 1,
    vehicle: {
      selectedId: null,
      make: "",
      model: "",
      year: "",
      type: "",
      fuel: "",
      color: "",
      features: [],
    },
    pricing: { farePerSeat: 0, paymentMethods: ["upi"] },
    preferences: {
      gender: "any",
      conversation: "any",
      music: "any",
      ageRange: [18, 25],
      rules: [],
      notes: "",
    },
  });
  const steps = useMemo(
    () => [
      { id: 1, title: "Route", component: "route" },
      { id: 2, title: "Schedule", component: "schedule" },
      { id: 3, title: "Seats", component: "seats" },
      { id: 4, title: "Vehicle", component: "vehicle" },
      { id: 5, title: "Pricing", component: "pricing" },
      { id: 6, title: "Preferences", component: "preferences" },
    ],
    [],
  );

  // Restore draft
  useEffect(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) setFormData(JSON.parse(savedData));
    } catch (err) {
      console.error("Error restoring draft:", err);
    }
  }, []);

  // Auto-save
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  // Step validation
  const validateStep = useCallback(
    (step: number) => {
      const newErrors: Record<string, string> = {};
      switch (step) {
        case 1:
          if (!formData.route.pickup.trim())
            newErrors.pickup = "Pickup required";
          if (!formData.route.dropoff.trim())
            newErrors.dropoff = "Drop-off required";
          break;
        case 2:
          if (!formData.schedule.date) newErrors.date = "Date required";
          if (!formData.schedule.time) newErrors.time = "Time required";
          break;
        case 3:
          if (!formData.availableSeats || formData.availableSeats < 1)
            newErrors.availableSeats = "Select at least 1 seat";
          break;
        case 4:
          if (!formData.vehicle.selectedId && !formData.vehicle.make)
            newErrors.vehicle = "Select or add a vehicle";
          break;
        case 5:
          if (!formData.pricing.farePerSeat || formData.pricing.farePerSeat < 1)
            newErrors.farePerSeat = "Set a fare amount";
          if (formData.pricing.paymentMethods.length === 0)
            newErrors.paymentMethods = "Select at least one payment method";
          break;
        default:
          break;
      }
      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [formData],
  );

  const isStepComplete = useCallback(
    (step: number) => {
      switch (step) {
        case 1:
          return Boolean(
            formData.route.pickup.trim() && formData.route.dropoff.trim(),
          );
        case 2:
          return Boolean(formData.schedule.date && formData.schedule.time);
        case 3:
          return Boolean(
            formData.availableSeats && formData.availableSeats > 0,
          );
        case 4:
          return Boolean(formData.vehicle.selectedId || formData.vehicle.make);
        case 5:
          return Boolean(
            formData.pricing.farePerSeat &&
            formData.pricing.farePerSeat > 0 &&
            formData.pricing.paymentMethods.length > 0,
          );
        case 6:
          return true;
        default:
          return false;
      }
    },
    [formData],
  );

  // Step navigation
  const handleNext = useCallback(() => {
    if (validateStep(currentStep)) {
      if (currentStep < steps.length) setCurrentStep((prev) => prev + 1);
      else setShowPreview(true);
    } else {
      toast.error("Please complete all required fields");
    }
  }, [currentStep, steps.length, validateStep]);

  const handlePrevious = useCallback(
    () => setCurrentStep((prev) => Math.max(prev - 1, 1)),
    [],
  );

  // Publish ride API
  const handlePublish = useCallback(async () => {
    if (loading) return;
    try {
      const body = {
        pickup_location: formData.route.pickup,
        drop_location: formData.route.dropoff,
        pickup_lat: formData.route.pickup_lat || "23.33",
        pickup_lng: formData.route.pickup_lng || "22.22",
        drop_lat: formData.route.drop_lat || "18.88",
        drop_lng: formData.route.drop_lng || "19.99",
        available_seats: formData.availableSeats,
        price_per_seat: formData.pricing.farePerSeat,
        date: formData.schedule.date,
        time: formData.schedule.time,
        vehicle_details: formData.vehicle.make
          ? `${formData.vehicle.make} ${formData.vehicle.model || ""}`.trim()
          : null,
        notes: formData.preferences.notes || null,
      };

      await createRideOffer(body);

      toast.success("Ride published successfully!");
      localStorage.removeItem(STORAGE_KEY);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof Error) {
        console.error("Publish error: ", err);
        toast.error(err.message || "Failed to publish ride");
      } else {
        console.error("Publish error: ", err);
        toast.error("Failed to publish ride");
      }
    }
  }, [createRideOffer, formData, router, loading]);

  const renderCurrentStep = useCallback(() => {
    const comp = steps[currentStep - 1]?.component;
    const props = { formData, updateFormData: setFormData, errors };
    switch (comp) {
      case "route":
        return <RouteSection {...props} />;
      case "schedule":
        return <DateTimeSection {...props} />;
      case "seats":
        return <SeatsSection {...props} />;
      case "vehicle":
        return <VehicleSection {...props} />;
      case "pricing":
        return <PricingSection {...props} />;
      case "preferences":
        return <PreferencesSection {...props} />;
      default:
        return null;
    }
  }, [currentStep, steps, formData, errors]);

  const completedSteps = useMemo(
    () =>
      steps
        .slice(0, currentStep)
        .filter((_, i) => isStepComplete(i + 1)).length,
    [steps, isStepComplete, currentStep],
  );

  const isFormComplete = completedSteps === steps.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="page min-h-screen bg-background"
    >
      <div className="pb-20 md:pb-6">
        <div className="container mx-auto max-w-5xl p-4 pt-6 space-y-6">
          <ProgressIndicator
            currentStep={currentStep}
            totalSteps={steps.length}
            steps={steps}
          />
          {renderCurrentStep()}

          <div className="flex flex-col gap-4 border-t border-border pt-6 md:flex-row md:items-center md:justify-between">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className="shadow-sm"
            >
              <ChevronLeft />
              Previous
            </Button>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="CheckCircle" size={16} className="text-success" />
                <span>
                  {completedSteps}/{steps.length} completed
                </span>
              </div>

              {currentStep < steps.length ? (
                <Button
                  variant="default"
                  onClick={handleNext}
                  className="shadow-sm"
                >
                  Next
                  <ChevronRight />
                </Button>
              ) : (
                <Button
                  variant="default"
                  onClick={() => setShowPreview(true)}
                  disabled={!isFormComplete || loading}
                  className="shadow-sm"
                >
                  <Eye />
                  Preview & Publish
                </Button>
              )}
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-4 flex flex-col gap-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3">
              <Icon name="Save" size={20} className="text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Draft saved locally
                </p>
                <p className="text-xs text-muted-foreground">
                  Your progress stays on this device until you publish.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm("Clear your saved draft?")) {
                    localStorage.removeItem(STORAGE_KEY);
                    window.location.reload();
                  }
                }}
              >
                <Trash2 />
                Clear Draft
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/dashboard")}
              >
                <Home />
                Save & Exit
              </Button>
            </div>
          </div>
        </div>
      </div>

      <PreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        formData={formData}
        onPublish={handlePublish}
      />

      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-lg font-medium text-foreground">
              Publishing your ride...
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              This may take a few moments
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default PostRide;
