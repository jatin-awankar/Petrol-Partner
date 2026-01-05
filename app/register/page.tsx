"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    college_name: "",
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1️⃣ Call your backend to register the user
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      // 2️⃣ Automatically log in with NextAuth
      const signInRes = await signIn("credentials", {
        redirect: false,
        email: formData.email,
        password: formData.password,
      });

      if (signInRes?.error) {
        throw new Error(signInRes.error);
      }

      alert("Registration successful! Redirecting to dashboard...");
      router.push("/dashboard");
    } catch (err: any) {
      alert(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-card border border-border rounded-lg shadow p-6 w-full max-w-md space-y-4"
      >
        <h1 className="text-2xl font-semibold text-foreground text-center">
          Create an Account
        </h1>

        <input
          type="text"
          name="full_name"
          placeholder="Full Name"
          value={formData.full_name}
          onChange={handleChange}
          className="border border-gray-300 rounded-md p-2 w-full mb-4 focus:ring-1 focus:ring-blue-400 outline-none"
          disabled={loading}
          required
        />

        <input
          type="email"
          name="email"
          placeholder="Email Address"
          value={formData.email}
          onChange={handleChange}
          className="border border-gray-300 rounded-md p-2 w-full mb-4 focus:ring-1 focus:ring-blue-400 outline-none"
          disabled={loading}
          required
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          className="border border-gray-300 rounded-md p-2 w-full mb-4 focus:ring-1 focus:ring-blue-400 outline-none"
          disabled={loading}
          required
        />

        <input
          type="text"
          name="college_name"
          placeholder="College Name (optional)"
          value={formData.college_name}
          onChange={handleChange}
          className="border border-gray-300 rounded-md p-2 w-full mb-4 focus:ring-1 focus:ring-blue-400 outline-none"
          disabled={loading}
        />

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 rounded-md text-white font-semibold transition cursor-pointer ${
            loading
              ? "bg-blue-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {loading ? "Creating Account..." : "Register"}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="text-primary hover:underline">
            Sign in
          </a>
        </p>
      </form>
    </div>
  );
}
