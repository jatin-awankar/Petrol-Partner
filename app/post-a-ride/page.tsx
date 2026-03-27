"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Eye, Home, Trash2 } from "lucide-react";

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
import { useCreateRideOffer } from "@/hooks/rides/useRideOffers";
import { useCreateRideRequest } from "@/hooks/rides/useRideRequests";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";

const STORAGE_KEY = "postRideFormData";
type PostMode = "offer" | "request";

const initialFormData = {
  mode: "offer" as PostMode,
  route: {
    pickup: "",
    dropoff: "",
    pickup_lat: null as number | null,
    pickup_lng: null as number | null,
    drop_lat: null as number | null,
    drop_lng: null as number | null,
  },
  schedule: {
    date: "",
    time: "",
    flexibility: 0,
    recurring: { enabled: false, days: [], endDate: "" },
  },
  availableSeats: 1,
  seatsRequired: 1,
  vehicle: {
    selectedId: null as string | null,
    make: "",
    model: "",
    year: "",
    type: "",
    fuel: "",
    color: "",
    features: [] as string[],
  },
  pricing: { farePerSeat: 0, paymentMethods: ["upi"] as string[] },
  preferences: {
    gender: "any",
    conversation: "any",
    music: "any",
    ageRange: [18, 25],
    rules: [] as string[],
    notes: "",
  },
};

function getFriendlyBusinessError(error: unknown) {
  const fallback = "Failed to publish. Please try again.";
  const details = error as { code?: string; message?: string };

  switch (details?.code) {
    case "STUDENT_VERIFICATION_REQUIRED":
      return "Student verification is required before posting rides.";
    case "STUDENT_VERIFICATION_INACTIVE":
      return "Your student verification is not active right now.";
    case "DRIVER_ELIGIBILITY_NOT_APPROVED":
      return "Driver eligibility must be approved before posting a ride offer.";
    case "VEHICLE_NOT_APPROVED":
    case "VEHICLE_REQUIRED_FOR_RIDE_OFFER":
      return "Please select an approved active vehicle.";
    case "FINANCIAL_HOLD_ACTIVE":
      return "You have an overdue balance. Clear it before posting a new ride.";
    default:
      return details?.message || fallback;
  }
}

const PostRide = () => {
  const { isAuthenticated, loading: authLoading } = useCurrentUser();
  const router = useRouter();

  const { createRideOffer, loading: offerLoading } = useCreateRideOffer();
  const { createRideRequest, loading: requestLoading } = useCreateRideRequest();

  const [currentStep, setCurrentStep] = useState(1);
  const [showPreview, setShowPreview] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState(initialFormData);

  const mode = formData.mode;
  const loading = offerLoading || requestLoading;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const steps = useMemo(() => {
    const modeSteps =
      mode === "offer"
        ? [
            { id: 1, title: "Route", component: "route" },
            { id: 2, title: "Schedule", component: "schedule" },
            { id: 3, title: "Seats", component: "seats" },
            { id: 4, title: "Vehicle", component: "vehicle" },
            { id: 5, title: "Pricing", component: "pricing" },
            { id: 6, title: "Preferences", component: "preferences" },
          ]
        : [
            { id: 1, title: "Route", component: "route" },
            { id: 2, title: "Schedule", component: "schedule" },
            { id: 3, title: "Seats", component: "seats" },
            { id: 4, title: "Pricing", component: "pricing" },
            { id: 5, title: "Preferences", component: "preferences" },
          ];

    return modeSteps;
  }, [mode]);

  useEffect(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (!savedData) return;
      const parsed = JSON.parse(savedData);
      setFormData({ ...initialFormData, ...parsed });
    } catch {
      setFormData(initialFormData);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  const validateStep = useCallback(
    (step: number) => {
      const newErrors: Record<string, string> = {};

      switch (step) {
        case 1:
          if (!formData.route.pickup.trim()) newErrors.pickup = "Pickup required";
          if (!formData.route.dropoff.trim()) newErrors.dropoff = "Drop-off required";
          if (
            formData.route.pickup_lat === null ||
            formData.route.pickup_lng === null ||
            formData.route.drop_lat === null ||
            formData.route.drop_lng === null
          ) {
            newErrors.routeCoordinates = "Please select both pickup and drop from map/search.";
          }
          break;
        case 2:
          if (!formData.schedule.date) newErrors.date = "Date required";
          if (!formData.schedule.time) newErrors.time = "Time required";
          break;
        case 3:
          if (mode === "offer" && formData.availableSeats < 1) {
            newErrors.availableSeats = "Select at least 1 seat";
          }
          if (mode === "request" && formData.seatsRequired < 1) {
            newErrors.seatsRequired = "Select at least 1 seat";
          }
          break;
        case 4:
          if (mode === "offer" && !formData.vehicle.selectedId) {
            newErrors.vehicle = "Select an approved vehicle from your profile";
          }
          if (mode === "request" && formData.pricing.farePerSeat < 1) {
            newErrors.farePerSeat = "Set your max price per seat";
          }
          break;
        case 5:
          if (mode === "offer") {
            if (formData.pricing.farePerSeat < 1) newErrors.farePerSeat = "Set a fare amount";
            if (!formData.pricing.paymentMethods.length) {
              newErrors.paymentMethods = "Select at least one payment method";
            }
          }
          break;
        default:
          break;
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [formData, mode],
  );

  const handleNext = useCallback(() => {
    if (!validateStep(currentStep)) {
      toast.error("Please complete all required fields");
      return;
    }

    if (currentStep < steps.length) {
      setCurrentStep((prev) => prev + 1);
      return;
    }

    setShowPreview(true);
  }, [currentStep, steps.length, validateStep]);

  const handlePrevious = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  }, []);

  const handleModeChange = (nextMode: PostMode) => {
    if (nextMode === mode) return;

    setFormData((prev) => ({
      ...prev,
      mode: nextMode,
      seatsRequired: nextMode === "request" ? Math.max(1, prev.seatsRequired) : prev.seatsRequired,
      availableSeats: nextMode === "offer" ? Math.max(1, prev.availableSeats) : prev.availableSeats,
    }));
    setCurrentStep(1);
    setErrors({});
  };

  const handlePublish = useCallback(async () => {
    const allValid = steps.every((_, idx) => validateStep(idx + 1));
    if (!allValid) {
      toast.error("Please complete required details before publishing.");
      return;
    }

    setIsPublishing(true);
    try {
      const sharedPayload = {
        pickup_location: formData.route.pickup,
        drop_location: formData.route.dropoff,
        pickup_lat: Number(formData.route.pickup_lat),
        pickup_lng: Number(formData.route.pickup_lng),
        drop_lat: Number(formData.route.drop_lat),
        drop_lng: Number(formData.route.drop_lng),
        date: formData.schedule.date,
        time: formData.schedule.time,
        price_per_seat: Number(formData.pricing.farePerSeat),
        counterparty_gender_preference:
          formData.preferences.gender === "female"
            ? "female_only"
            : formData.preferences.gender === "male"
              ? "male_only"
              : "any",
        notes: formData.preferences.notes || undefined,
      };

      if (mode === "offer") {
        await createRideOffer({
          ...sharedPayload,
          available_seats: Number(formData.availableSeats),
          vehicle_id: formData.vehicle.selectedId,
          vehicle_details: formData.vehicle.make
            ? {
                make: formData.vehicle.make,
                model: formData.vehicle.model || "",
                year: formData.vehicle.year || "",
                color: formData.vehicle.color || "",
                fuelType: formData.vehicle.fuel || "",
                features: formData.vehicle.features || [],
              }
            : undefined,
        });
      } else {
        await createRideRequest({
          ...sharedPayload,
          seats_required: Number(formData.seatsRequired),
        });
      }

      toast.success(mode === "offer" ? "Ride offer published." : "Ride request published.");
      localStorage.removeItem(STORAGE_KEY);
      router.push("/dashboard");
    } catch (error) {
      toast.error(getFriendlyBusinessError(error));
    } finally {
      setIsPublishing(false);
    }
  }, [createRideOffer, createRideRequest, formData, mode, router, steps, validateStep]);

  const renderCurrentStep = useCallback(() => {
    const component = steps[currentStep - 1]?.component;
    const commonProps = { formData, updateFormData: setFormData, errors };

    switch (component) {
      case "route":
        return <RouteSection {...commonProps} />;
      case "schedule":
        return <DateTimeSection {...commonProps} />;
      case "seats":
        return <SeatsSection {...commonProps} mode={mode} />;
      case "vehicle":
        return <VehicleSection {...commonProps} />;
      case "pricing":
        return <PricingSection {...commonProps} />;
      case "preferences":
        return <PreferencesSection {...commonProps} />;
      default:
        return null;
    }
  }, [currentStep, steps, formData, errors, mode]);

  const completedSteps = useMemo(
    () => steps.filter((_, index) => validateStep(index + 1)).length,
    [steps, validateStep],
  );
  const isFormComplete = completedSteps >= steps.length - 1;

  if (authLoading) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="page min-h-screen bg-background container mx-auto p-4 space-y-6"
    >
      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Posting mode</p>
        <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === "offer" ? "default" : "outline"}
            onClick={() => handleModeChange("offer")}
          >
            <Icon name="Car" size={16} />
            Ride Offer
          </Button>
          <Button
            type="button"
            variant={mode === "request" ? "default" : "outline"}
            onClick={() => handleModeChange("request")}
          >
            <Icon name="Hand" size={16} />
            Ride Request
          </Button>
        </div>
      </div>

      <div className="pb-20 md:pb-6">
        <ProgressIndicator currentStep={currentStep} totalSteps={steps.length} steps={steps} />
        <div className="max-w-4xl mx-auto p-4 pt-6 space-y-6">
          {renderCurrentStep()}

          <div className="flex items-center justify-between pt-6 border-t border-border">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className="shadow-sm"
            >
              <ChevronLeft />
              Previous
            </Button>

            <div className="flex items-center space-x-3">
              <div className="hidden md:flex items-center space-x-2 text-sm text-muted-foreground">
                <Icon name="CheckCircle" size={16} className="text-success" />
                <span>
                  {completedSteps}/{steps.length} completed
                </span>
              </div>

              {currentStep < steps.length ? (
                <Button variant="default" onClick={handleNext} className="shadow-sm">
                  Next
                  <ChevronRight />
                </Button>
              ) : (
                <Button
                  variant="default"
                  onClick={() => setShowPreview(true)}
                  disabled={!isFormComplete}
                  className="shadow-sm"
                >
                  <Eye />
                  Preview & Publish
                </Button>
              )}
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-4 flex items-center justify-between shadow-soft">
            <div className="flex items-center space-x-3">
              <Icon name="Save" size={20} className="text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Auto-saved</p>
                <p className="text-xs text-muted-foreground">Your progress is automatically saved</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-fit items-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm("Are you sure you want to clear all data?")) {
                    localStorage.removeItem(STORAGE_KEY);
                    window.location.reload();
                  }
                }}
              >
                <Trash2 />
                Clear All
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard")}
                className="bg-accent dark:bg-accent/50"
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
        mode={mode}
        onPublish={handlePublish}
      />

      {(loading || isPublishing) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">
              {mode === "offer" ? "Publishing ride offer..." : "Publishing ride request..."}
            </p>
            <p className="text-sm text-muted-foreground mt-2">This may take a few moments</p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default PostRide;
