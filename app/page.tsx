"use client";
import HeroSection from "@/components/HeroSection";
import FeatureSection from "@/components/FeatureSection";
import CTASection from "@/components/CTASection";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading) return null;

  return (
    <main>
      <HeroSection />
      <FeatureSection />
      <CTASection />
    </main>
  );
}
