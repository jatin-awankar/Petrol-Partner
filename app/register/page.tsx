"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getProviders, signIn, useSession } from "next-auth/react";
import {
  CarFront,
  CheckCircle2,
  MapPinned,
  ShieldCheck,
  Users,
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { status } = useSession();

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    college_name: "",
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasGoogleProvider, setHasGoogleProvider] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  useEffect(() => {
    let active = true;

    const loadProviders = async () => {
      try {
        const providers = await getProviders();
        if (active) {
          setHasGoogleProvider(Boolean(providers?.google));
        }
      } catch {
        if (active) {
          setHasGoogleProvider(false);
        }
      }
    };

    loadProviders();
    return () => {
      active = false;
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const payload = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        college_name: formData.college_name.trim(),
      };

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      const signInRes = await signIn("credentials", {
        redirect: false,
        email: payload.email,
        password: payload.password,
        callbackUrl: "/dashboard",
      });

      if (signInRes?.error) {
        throw new Error(signInRes.error);
      }

      router.replace(signInRes?.url || "/dashboard");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      setErrorMsg("Google sign-up failed. Please try again.");
      setLoading(false);
    }
  };

  const onboardingPoints = [
    {
      title: "Single account for everything",
      detail: "Find rides, offer rides, and chat from the same login.",
      icon: Users,
    },
    {
      title: "Route-based discovery",
      detail: "Get matches around your actual campus commute path.",
      icon: MapPinned,
    },
    {
      title: "Safer student network",
      detail: "Travel in a trusted circle with verified profiles.",
      icon: ShieldCheck,
    },
  ];

  return (
    <main className="min-h-screen">
      <div className="page py-5 md:py-8">
        <div className="grid gap-4 lg:grid-cols-[0.96fr_1.04fr] lg:gap-6">
          <section className="order-1 rounded-3xl border border-border/80 bg-card/75 p-5 shadow-soft backdrop-blur-sm md:p-7">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <CarFront size={13} />
              Join Petrol Partner
            </p>

            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Create your account and start sharing campus rides.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              One account works for both finding a ride and offering seats.
            </p>

            {errorMsg && (
              <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMsg}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <input
                type="text"
                name="full_name"
                placeholder="Full Name"
                value={formData.full_name}
                onChange={handleChange}
                className="w-full rounded-md border border-border bg-background p-2.5 text-foreground outline-none transition focus:ring-2 focus:ring-ring"
                disabled={loading}
                required
              />

              <input
                type="email"
                name="email"
                placeholder="College or personal email"
                value={formData.email}
                onChange={handleChange}
                className="w-full rounded-md border border-border bg-background p-2.5 text-foreground outline-none transition focus:ring-2 focus:ring-ring"
                disabled={loading}
                required
              />

              <input
                type="password"
                name="password"
                placeholder="Create password"
                value={formData.password}
                onChange={handleChange}
                className="w-full rounded-md border border-border bg-background p-2.5 text-foreground outline-none transition focus:ring-2 focus:ring-ring"
                disabled={loading}
                required
              />

              <input
                type="text"
                name="college_name"
                placeholder="College name (optional)"
                value={formData.college_name}
                onChange={handleChange}
                className="w-full rounded-md border border-border bg-background p-2.5 text-foreground outline-none transition focus:ring-2 focus:ring-ring"
                disabled={loading}
              />

              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-md py-2.5 font-semibold text-white transition ${
                  loading
                    ? "cursor-not-allowed bg-primary/60"
                    : "cursor-pointer bg-primary hover:bg-primary/90"
                }`}
              >
                {loading ? "Creating account..." : "Create account"}
              </button>

              {hasGoogleProvider && (
                <>
                  <p className="my-2 text-center text-sm text-muted-foreground">or</p>
                  <button
                    type="button"
                    onClick={handleGoogleSignUp}
                    disabled={loading}
                    className={`w-full rounded-md border py-2.5 font-semibold transition ${
                      loading
                        ? "cursor-not-allowed border-border text-muted-foreground"
                        : "cursor-pointer border-border text-foreground hover:bg-accent"
                    }`}
                  >
                    Continue with Google
                  </button>
                </>
              )}
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </section>

          <section className="order-2 rounded-3xl border border-border/80 bg-gradient-hero p-5 shadow-soft md:p-8">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Designed for real college commute routines
            </h2>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              From hostel pickups to metro drops, post or join rides with clear
              timing and fair cost splits.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card/75 p-3">
                <p className="text-lg font-semibold text-foreground">No roles</p>
                <p className="text-xs text-muted-foreground">Driver and rider in one flow</p>
              </div>
              <div className="rounded-2xl border border-border bg-card/75 p-3">
                <p className="text-lg font-semibold text-foreground">Mobile first</p>
                <p className="text-xs text-muted-foreground">Built for on-the-go updates</p>
              </div>
              <div className="rounded-2xl border border-border bg-card/75 p-3">
                <p className="text-lg font-semibold text-foreground">Safer rides</p>
                <p className="text-xs text-muted-foreground">Verified student network</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {onboardingPoints.map((point) => (
                <div
                  key={point.title}
                  className="rounded-2xl border border-border bg-card/80 p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <point.icon size={16} />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{point.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{point.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 size={14} className="text-success" />
              Your account remains the same across all ride actions.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
