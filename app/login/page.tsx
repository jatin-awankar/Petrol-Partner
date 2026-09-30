"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import LoginForm from "@/components/LoginForm";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useCurrentUser();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, loading, router]);

  return (
    <AuthSplitLayout
      badge="Your account"
      title="Welcome back to Petrol Partner"
      description="Sign in to see your account readiness and the actions available now. Real bookings remain closed during launch checks."
      footer={
        <div className="space-y-2">
        <p>
          New here?{" "}
          <Link
            href="/register"
            className="font-medium text-primary hover:underline"
          >
            Create your account
          </Link>
        </p>
        <p><Link href="/recover" className="font-medium text-primary hover:underline">Forgot your password?</Link></p>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-md">
        <LoginForm />
      </div>
    </AuthSplitLayout>
  );
}
