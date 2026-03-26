import { redirect } from "next/navigation";
import Link from "next/link";

import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import LoginForm from "@/components/LoginForm";
import { getServerCurrentUser } from "@/lib/server-auth";

export default async function LoginPage() {
  const user = await getServerCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

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
