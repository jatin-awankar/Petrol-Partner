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
    college_name: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      await register({
        email: formData.email,
        password: formData.password,
        fullName: formData.full_name,
        college: formData.college_name || undefined,
      });

      router.push("/dashboard");
      router.refresh();
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
      badge="Campus Onboarding"
      title="Create your ride-sharing account"
      description="Join a verified student community and start offering or requesting trips in minutes."
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
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-md space-y-4"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Register
          </h1>
          <p className="text-sm text-muted-foreground">
            Use your student details to access ride posting and booking.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
            placeholder="you@college.edu"
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

        <div className="space-y-2">
          <Label htmlFor="register-college">College (optional)</Label>
          <Input
            id="register-college"
            type="text"
            name="college_name"
            placeholder="College or university name"
            value={formData.college_name}
            onChange={handleChange}
            disabled={loading}
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="h-10 w-full rounded-md"
        >
          {loading ? "Creating account..." : "Create Account"}
        </Button>
      </form>
    </AuthSplitLayout>
  );
}
