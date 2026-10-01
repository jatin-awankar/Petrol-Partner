"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";

export default function RegisterPage() {
  const { register, isAuthenticated, loading: authLoading } = useCurrentUser();
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const user = await register({
        email: formData.email,
        password: formData.password,
        fullName: formData.full_name,
      });

      if (user) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setVerificationSent(true);
      }
    } catch (err: unknown) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Something went wrong",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSplitLayout
      badge="Your account"
      title="Create a Petrol Partner account"
      description="Confirm email ownership, then review your declarations and account readiness. Ride bookings are not available yet."
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {verificationSent ? (
        <div className="mx-auto w-full max-w-md space-y-4">
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p className="text-sm text-muted-foreground">Follow the verification link to confirm email ownership. Account creation and email confirmation do not grant ride eligibility. You can review declarations after signing in; real bookings remain closed.</p>
          <Link className="font-medium text-primary hover:underline" href="/login">Return to sign in</Link>
        </div>
      ) : <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-md space-y-4"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Register
          </h1>
          <p className="text-sm text-muted-foreground">
            Anyone can create an account. Email ownership, self-declarations, and ride eligibility are separate steps.
          </p>
        </div>

        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="register-name">Full name</Label>
          <Input
            id="register-name"
            type="text"
            name="full_name"
            placeholder="Your full name"
            value={formData.full_name}
            onChange={handleChange}
            disabled={loading}
            required
            autoComplete="name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            type="email"
            name="email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={handleChange}
            disabled={loading}
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-password">Password</Label>
          <Input
            id="register-password"
            type="password"
            name="password"
            placeholder="Create a secure password"
            value={formData.password}
            onChange={handleChange}
            disabled={loading}
            required
            autoComplete="new-password"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="min-h-11 w-full rounded-md"
        >
          {loading ? "Creating account..." : "Create Account"}
        </Button>
      </form>}
    </AuthSplitLayout>
  );
}
