"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginForm() {
  const router = useRouter();
  const { login } = useCurrentUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      await login({ email, password });
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMsg(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Unable to sign in",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="text-sm text-muted-foreground">
          Continue with your registered student account.
        </p>
      </div>

      {errorMsg && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            placeholder="you@college.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" disabled={loading} className="h-10 w-full rounded-md">
          {loading ? "Signing in..." : "Sign In"}
        </Button>

        <div className="relative py-1">
          <div className="absolute inset-0 top-1/2 h-px bg-border" />
          <p className="relative mx-auto w-fit bg-card px-3 text-xs uppercase tracking-[0.15em] text-muted-foreground">
            Alternative
          </p>
        </div>

        <Button
          type="button"
          onClick={() =>
            setErrorMsg("Google sign-in is not available during the backend cutover.")
          }
          variant="outline"
          disabled={loading}
          className="h-10 w-full rounded-md"
        >
          Sign in with Google
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
