"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getCurrentUserFromBackend,
  loginWithBackend,
  logoutFromBackend,
  registerWithBackend,
  type BackendAuthUser,
} from "@/lib/api/backend";
import { ApiError, setClientAuthFailureHandler } from "@/lib/api/client";

interface AuthContextValue {
  user: BackendAuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<BackendAuthUser | null>;
  clearUser: () => void;
  login: (input: { email: string; password: string }) => Promise<BackendAuthUser>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    college?: string;
  }) => Promise<BackendAuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BackendAuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const nextUser = await getCurrentUserFromBackend();
      setUser(nextUser);
      return nextUser;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        return null;
      }

      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser().catch(() => {
      setUser(null);
      setLoading(false);
    });
  }, [refreshUser]);

  useEffect(() => {
    setClientAuthFailureHandler(() => {
      setUser(null);

      if (typeof window === "undefined") {
        return;
      }

      const pathname = window.location.pathname;

      if (pathname !== "/login" && pathname !== "/register") {
        window.location.assign("/login");
      }
    });

    return () => {
      setClientAuthFailureHandler(null);
    };
  }, []);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const result = await loginWithBackend(input);
      setUser(result.user);
      return result.user;
    },
    [],
  );

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      fullName: string;
      phone?: string;
      college?: string;
    }) => {
      const result = await registerWithBackend(input);
      setUser(result.user);
      return result.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    await logoutFromBackend();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      refreshUser,
      clearUser: () => setUser(null),
      login,
      register,
      logout,
    }),
    [user, loading, refreshUser, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
