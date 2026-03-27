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
      badge="Student Ride Access"
      title="Welcome back to your campus ride network"
      description="Sign in to manage ride offers, booking requests, and post-trip settlements with one secure account."
      footer={
        <p>
          New here?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create your account
          </Link>
        </p>
      }
    >
      <div className="mx-auto w-full max-w-md">
        <LoginForm />
      </div>
    </AuthSplitLayout>
  );
}
