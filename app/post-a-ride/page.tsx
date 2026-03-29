"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type StepMeta = {
  id: number;
  title: string;
  component: string;
  subtitle: string;
};

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

  const steps = useMemo<StepMeta[]>(() => {
    return mode === "offer"
      ? [
          {
            id: 1,
            title: "Route",
            component: "route",
            subtitle: "Pickup and drop",
          },
          {
            id: 2,
            title: "Schedule",
            component: "schedule",
            subtitle: "When you leave",
          },
          {
            id: 3,
            title: "Seats",
            component: "seats",
            subtitle: "Passenger capacity",
          },
          {
            id: 4,
            title: "Vehicle",
            component: "vehicle",
            subtitle: "Approved vehicle",
          },
          {
            id: 5,
            title: "Pricing",
            component: "pricing",
            subtitle: "Fare per seat",
          },
          {
            id: 6,
            title: "Preferences",
            component: "preferences",
            subtitle: "Ride conditions",
          },
        ]
      : [
          {
            id: 1,
            title: "Route",
            component: "route",
            subtitle: "Pickup and drop",
          },
          {
            id: 2,
            title: "Schedule",
            component: "schedule",
            subtitle: "When you need ride",
          },
          {
            id: 3,
            title: "Seats",
            component: "seats",
            subtitle: "Seats needed",
          },
          {
            id: 4,
            title: "Pricing",
            component: "pricing",
            subtitle: "Your max price",
          },
          {
            id: 5,
            title: "Preferences",
            component: "preferences",
            subtitle: "Ride conditions",
          },
        ];
  }, [mode]);

  useEffect(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (!savedData) return;
      const parsed = JSON.parse(savedData);
      setFormData({
        ...initialFormData,
        ...parsed,
        route: {
          ...initialFormData.route,
          ...(parsed?.route ?? {}),
        },
        schedule: {
          ...initialFormData.schedule,
          ...(parsed?.schedule ?? {}),
          recurring: {
            ...initialFormData.schedule.recurring,
            ...(parsed?.schedule?.recurring ?? {}),
          },
        },
        vehicle: {
          ...initialFormData.vehicle,
          ...(parsed?.vehicle ?? {}),
        },
        pricing: {
          ...initialFormData.pricing,
          ...(parsed?.pricing ?? {}),
        },
        preferences: {
          ...initialFormData.preferences,
          ...(parsed?.preferences ?? {}),
        },
      });
    } catch {
      setFormData(initialFormData);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  const getStepErrors = (
    step: number,
    state: typeof formData,
    currentMode: PostMode,
  ): Record<string, string> => {
    const nextErrors: Record<string, string> = {};
    const seatsOffer = Number(state.availableSeats);
    const seatsRequest = Number(state.seatsRequired);
    const fareValue = Number(state.pricing.farePerSeat);
    const pickupLat = Number(state.route.pickup_lat);
    const pickupLng = Number(state.route.pickup_lng);
    const dropLat = Number(state.route.drop_lat);
    const dropLng = Number(state.route.drop_lng);

    if (step === 1) {
      if (!state.route.pickup.trim()) nextErrors.pickup = "Pickup required";
      if (!state.route.dropoff.trim()) nextErrors.dropoff = "Drop-off required";
      if (
        !Number.isFinite(pickupLat) ||
        !Number.isFinite(pickupLng) ||
        !Number.isFinite(dropLat) ||
        !Number.isFinite(dropLng)
      ) {
        nextErrors.routeCoordinates =
          "Select pickup and drop from search or map.";
      }
    }

    if (step === 2) {
      if (!state.schedule.date) nextErrors.date = "Date required";
      if (!state.schedule.time) nextErrors.time = "Time required";
    }

    if (step === 3) {
      if (
        currentMode === "offer" &&
        (!Number.isFinite(seatsOffer) || seatsOffer < 1)
      ) {
        nextErrors.availableSeats = "Select at least 1 seat";
      }
      if (
        currentMode === "request" &&
        (!Number.isFinite(seatsRequest) || seatsRequest < 1)
      ) {
        nextErrors.seatsRequired = "Select at least 1 seat";
      }
    }

    if (step === 4) {
      if (currentMode === "offer" && !state.vehicle.selectedId) {
        nextErrors.vehicle = "Select an approved vehicle from your profile";
      }
      if (
        currentMode === "request" &&
        (!Number.isFinite(fareValue) || fareValue < 1)
      ) {
        nextErrors.farePerSeat = "Set your max price per seat";
      }
    }

    if (
      step === 5 &&
      currentMode === "offer" &&
      (!Number.isFinite(fareValue) || fareValue < 1)
    ) {
      nextErrors.farePerSeat = "Set a fare amount";
    }

    return nextErrors;
  };

  const validateStep = useCallback(
    (step: number) => {
      const next = getStepErrors(step, formData, mode);
      setErrors(next);
      return Object.keys(next).length === 0;
    },
    [formData, mode],
  );

  const completedSteps = useMemo(
    () =>
      steps.filter(
        (step) =>
          Object.keys(getStepErrors(step.id, formData, mode)).length === 0,
      ).length,
    [steps, formData, mode],
  );

  const handleNext = () => {
    if (!validateStep(currentStep)) {
      toast.error("Please complete required fields.");
      return;
    }
    if (currentStep < steps.length) setCurrentStep((prev) => prev + 1);
    else setShowPreview(true);
  };

  const handlePrevious = () => setCurrentStep((prev) => Math.max(1, prev - 1));

  const handleModeChange = (nextMode: PostMode) => {
    if (nextMode === mode) return;
    setFormData((prev) => ({
      ...prev,
      mode: nextMode,
    }));
    setCurrentStep(1);
    setErrors({});
  };

  const handlePublish = async () => {
    const allValid = steps.every((step) => validateStep(step.id));
    if (!allValid) {
      toast.error("Please complete required details before publishing.");
      return;
    }

    setIsPublishing(true);
    try {
      const pickupLat = Number(formData.route.pickup_lat);
      const pickupLng = Number(formData.route.pickup_lng);
      const dropLat = Number(formData.route.drop_lat);
      const dropLng = Number(formData.route.drop_lng);
      const pricePerSeat = Number(formData.pricing.farePerSeat);
      const seatsRequired = Number(formData.seatsRequired);
      const availableSeats = Number(formData.availableSeats);

      if (
        !Number.isFinite(pickupLat) ||
        !Number.isFinite(pickupLng) ||
        !Number.isFinite(dropLat) ||
        !Number.isFinite(dropLng) ||
        !Number.isFinite(pricePerSeat)
      ) {
        toast.error(
          "Route and pricing fields are invalid. Please reselect values.",
        );
        return;
      }

      const sharedPayload = {
        pickup_location: formData.route.pickup,
        drop_location: formData.route.dropoff,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        drop_lat: dropLat,
        drop_lng: dropLng,
        date: formData.schedule.date,
        time: formData.schedule.time,
        price_per_seat: pricePerSeat,
        counterparty_gender_preference:
          formData.preferences.gender === "female"
            ? "female_only"
            : formData.preferences.gender === "male"
              ? "male_only"
              : "any",
        notification_enabled: true,
        notes: formData.preferences.notes || undefined,
      };

      if (mode === "offer") {
        if (!Number.isFinite(availableSeats) || availableSeats < 1) {
          toast.error("Invalid seat count. Please update seats.");
          return;
        }
        await createRideOffer({
          ...sharedPayload,
          available_seats: availableSeats,
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
        if (!Number.isFinite(seatsRequired) || seatsRequired < 1) {
          toast.error("Invalid seat requirement. Please update seats.");
          return;
        }
        await createRideRequest({
          ...sharedPayload,
          seats_required: seatsRequired,
        });
      }

      toast.success(
        mode === "offer" ? "Ride offer published." : "Ride request published.",
      );
      localStorage.removeItem(STORAGE_KEY);
      router.push("/dashboard");
    } catch (error) {
      toast.error(getFriendlyBusinessError(error));
    } finally {
      setIsPublishing(false);
    }
  };

  const activeStep = steps[currentStep - 1];
  const routeReady =
    formData.route.pickup_lat !== null &&
    formData.route.pickup_lng !== null &&
    formData.route.drop_lat !== null &&
    formData.route.drop_lng !== null;

  const renderCurrentStep = () => {
    const commonProps = { formData, updateFormData: setFormData, errors };
    switch (activeStep?.component) {
      case "route":
        return <RouteSection {...commonProps} />;
      case "schedule":
        return <DateTimeSection {...commonProps} mode={mode} />;
      case "seats":
        return <SeatsSection {...commonProps} mode={mode} />;
      case "vehicle":
        return <VehicleSection {...commonProps} />;
      case "pricing":
        return <PricingSection {...commonProps} mode={mode} />;
      case "preferences":
        return <PreferencesSection {...commonProps} mode={mode} />;
      default:
        return null;
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen mb-16 md:mb-auto bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.10),_transparent_48%),radial-gradient(circle_at_85%_15%,_hsl(var(--accent)/0.18),_transparent_42%)]">
      <div className="page container mx-auto px-3 py-4 sm:px-4 md:py-8">
        <div className="flex flex-col gap-4 md:gap-6">
          <header className="rounded-2xl border border-primary/20 bg-card/95 backdrop-blur-sm px-4 py-4 sm:px-5 sm:py-5 shadow-card">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Ride Publishing
                </p>
                <h1 className="mt-1 text-xl sm:text-2xl md:text-3xl font-semibold text-foreground">
                  {mode === "offer" ? "Offer a ride" : "Request a ride"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Post in minutes with clean route, schedule and pricing
                  details.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="border border-primary/25 bg-primary/10 text-primary"
                  >
                    Student-only network
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  >
                    Safer verified rides
                  </Badge>
                </div>
              </div>

              <Tabs
                value={mode}
                onValueChange={(value) => handleModeChange(value as PostMode)}
              >
                <TabsList className="h-11 w-full sm:w-auto p-1">
                  <TabsTrigger value="offer" className="px-3 sm:px-5">
                    <Icon name="Car" size={16} />
                    Offer
                  </TabsTrigger>
                  <TabsTrigger value="request" className="px-3 sm:px-5">
                    <Icon name="Hand" size={16} />
                    Request
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </header>

          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 md:gap-6">
            <aside className="space-y-4 xl:sticky xl:top-6 self-start">
              <Card className="border-primary/20 bg-card/95 py-4 shadow-[0_8px_28px_-22px_hsl(var(--primary))]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    Journey Progress
                    <Badge variant="outline">
                      {completedSteps}/{steps.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ProgressIndicator
                    currentStep={currentStep}
                    totalSteps={steps.length}
                    steps={steps}
                  />
                </CardContent>
              </Card>

              <Card className="border-sky-500/20 bg-sky-500/[0.04] py-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Trip Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="rounded-lg border border-border/70 bg-background/70 p-3">
                    <p className="text-xs text-muted-foreground">Route</p>
                    <p className="mt-1 text-foreground truncate">
                      {formData.route.pickup || "Pickup not selected"}
                    </p>
                    <p className="mt-1 text-foreground truncate">
                      {formData.route.dropoff || "Dropoff not selected"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Route locked</span>
                    <Badge variant={routeReady ? "secondary" : "outline"}>
                      {routeReady ? "Ready" : "Pending"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Fare / seat</span>
                    <span className="font-semibold text-foreground">
                      ₹ {formData.pricing.farePerSeat || 0}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-emerald-500/20 bg-emerald-500/[0.04]">
                <CardContent className="py-4 text-sm text-muted-foreground leading-relaxed">
                  Use clear pickup points, realistic pricing, and accurate
                  timings to get faster matches.
                </CardContent>
              </Card>
            </aside>

            <section className="rounded-2xl border border-border/70 bg-card/95 backdrop-blur-sm shadow-card">
              <div className="border-b border-border/70 px-4 py-4 sm:px-5 md:px-6">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Step {currentStep}
                </p>
                <h2 className="mt-1 text-lg md:text-xl font-semibold text-foreground">
                  {activeStep?.title}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {activeStep?.subtitle}
                </p>
              </div>

              <div className="p-3 sm:p-4 md:p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${mode}-${currentStep}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {renderCurrentStep()}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="border-t border-border/70 px-3 py-4 sm:px-4 md:px-6">
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={currentStep === 1}
                    className="w-full sm:w-auto"
                  >
                    <ChevronLeft />
                    Previous
                  </Button>

                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="ghost"
                      onClick={() => router.push("/dashboard")}
                      className="bg-accent/70 w-full sm:w-auto"
                    >
                      <Home />
                      Save & Exit
                    </Button>
                    <Button
                      variant="destructive"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        if (confirm("Clear all ride draft data?")) {
                          localStorage.removeItem(STORAGE_KEY);
                          window.location.reload();
                        }
                      }}
                    >
                      <Trash2 />
                      Clear
                    </Button>
                    {currentStep < steps.length ? (
                      <Button onClick={handleNext} className="w-full sm:w-auto">
                        Next
                        <ChevronRight />
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setShowPreview(true)}
                        className="w-full sm:w-auto"
                      >
                        <Eye />
                        Preview
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </section>
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
          <div className="bg-card rounded-lg p-6 sm:p-8 text-center mx-3">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">
              {mode === "offer"
                ? "Publishing ride offer..."
                : "Publishing ride request..."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostRide;
