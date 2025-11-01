"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { redirect, useRouter } from "next/navigation";
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
import { authOptions } from "@/lib/authOptions";
import { useSession } from "next-auth/react";

const STORAGE_KEY = "postRideFormData";

const PostRide = () => {
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/login");
    }
  }, [status]);

  const router = useRouter();

  const { createRideOffer, loading } = useCreateRideOffer();
  const [currentStep, setCurrentStep] = useState(1);
  const [showPreview, setShowPreview] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
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
    []
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
      }
      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [formData]
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
    []
  );

  // Publish ride API
  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
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

      console.log("📦 Sending ride data:", body); // Debug log

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
    } finally {
      setIsPublishing(false);
    }
  }, [createRideOffer, formData, router]);

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
    () => steps.filter((_, i) => validateStep(i + 1)).length,
    [steps, validateStep]
  );

  const isFormComplete = completedSteps >= steps.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="page min-h-screen bg-background container mx-auto p-4 space-y-6"
    >
      <div className="pb-20 md:pb-6">
        <ProgressIndicator
          currentStep={currentStep}
          totalSteps={steps.length}
          steps={steps}
        />
        <div className="max-w-4xl mx-auto p-4 pt-6 space-y-6">
          {renderCurrentStep()}

          {/* Navigation */}
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
                  disabled={!isFormComplete}
                  className="shadow-sm"
                >
                  <Eye />
                  Preview & Publish
                </Button>
              )}
            </div>
          </div>

          {/* Auto-save info */}
          <div className="bg-card rounded-lg border border-border p-4 flex items-center justify-between shadow-soft">
            <div className="flex items-center space-x-3">
              <Icon name="Save" size={20} className="text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Auto-saved
                </p>
                <p className="text-xs text-muted-foreground">
                  Your progress is automatically saved
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-fit items-end ">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm("Are you sure you want to clear all data?")) {
                    localStorage.removeItem(STORAGE_KEY);
                    window.location.reload();
                  }
                }}
                className=""
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
