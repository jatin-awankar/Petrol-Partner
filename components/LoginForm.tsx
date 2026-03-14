"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasGoogleProvider, setHasGoogleProvider] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: email.trim().toLowerCase(),
        password,
        callbackUrl: "/dashboard",
      });

      if (res?.error) {
        setErrorMsg(res.error);
        return;
      }

      if (!res?.ok) {
        setErrorMsg("Unable to sign in right now. Please try again.");
        return;
      }

      router.replace(res?.url || "/dashboard");
      router.refresh();
    } catch {
      setErrorMsg("Unable to sign in right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      setErrorMsg("Google sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <h1 className="mb-6 text-center text-2xl font-semibold text-foreground">
        Sign in to Petrol Partner
      </h1>

      {errorMsg && (
        <p className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {errorMsg}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          className="w-full rounded-md border border-border bg-background p-2.5 text-foreground outline-none transition focus:ring-2 focus:ring-ring"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          required
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full rounded-md border border-border bg-background p-2.5 text-foreground outline-none transition focus:ring-2 focus:ring-ring"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          required
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
          {loading ? "Signing in..." : "Sign in"}
        </button>

        {hasGoogleProvider && (
          <>
            <p className="my-2 text-center text-sm text-muted-foreground">or</p>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className={`w-full rounded-md border py-2.5 font-semibold transition ${
                loading
                  ? "cursor-not-allowed border-border text-muted-foreground"
                  : "cursor-pointer border-border text-foreground hover:bg-accent"
              }`}
            >
              Sign in with Google
            </button>
          </>
        )}
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
