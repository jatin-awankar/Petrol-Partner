import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";

export interface ProviderIdentity {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  assuranceLevel: string | null;
  userMetadata: Record<string, unknown>;
}

export interface ProviderSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  identity: ProviderIdentity;
}

export interface AuthProvider {
  register(input: { email: string; password: string; fullName: string; college?: string }): Promise<void>;
  login(email: string, password: string): Promise<ProviderSession>;
  validate(accessToken: string): Promise<ProviderIdentity>;
  refresh(refreshToken: string): Promise<ProviderSession>;
  requestRecovery(email: string): Promise<void>;
  updatePassword(accessToken: string, password: string): Promise<void>;
  logout(accessToken: string): Promise<void>;
}

function providerError(status: number, body: unknown): never {
  const providerMessage =
    typeof body === "object" && body && "msg" in body ? String(body.msg) : "Authentication provider rejected the request";
  if (status >= 500) {
    throw new AppError(503, "Authentication assurance is temporarily unavailable", "AUTH_ASSURANCE_UNAVAILABLE");
  }
  throw new AppError(401, providerMessage, "INVALID_CREDENTIALS");
}

async function requestProvider(path: string, init: RequestInit = {}) {
  try {
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1${path}`, {
      ...init,
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY!,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(5_000),
    });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) providerError(response.status, body);
    return body as any;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, "Authentication assurance is temporarily unavailable", "AUTH_ASSURANCE_UNAVAILABLE");
  }
}

function identityFromUser(user: any): ProviderIdentity {
  return {
    subject: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
    assuranceLevel: user.aal ?? null,
    userMetadata: user.user_metadata ?? {},
  };
}

function sessionFromBody(body: any): ProviderSession {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in,
    identity: identityFromUser(body.user),
  };
}

export const supabaseAuthProvider: AuthProvider = {
  async register(input) {
    await requestProvider(`/signup?redirect_to=${encodeURIComponent(env.AUTH_CALLBACK_URL!)}`, {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        data: { full_name: input.fullName, college: input.college ?? null },
      }),
    });
  },
  async login(email, password) {
    return sessionFromBody(await requestProvider("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }));
  },
  async validate(accessToken) {
    const user = await requestProvider("/user", { headers: { Authorization: `Bearer ${accessToken}` } });
    return identityFromUser(user);
  },
  async refresh(refreshToken) {
    return sessionFromBody(await requestProvider("/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }));
  },
  async requestRecovery(email) {
    await requestProvider("/recover", {
      method: "POST",
      body: JSON.stringify({ email, redirect_to: env.AUTH_CALLBACK_URL }),
    });
  },
  async updatePassword(accessToken, password) {
    await requestProvider("/user", {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ password }),
    });
  },
  async logout(accessToken) {
    await requestProvider("/logout?scope=global", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
};

let providerOverride: AuthProvider | null = null;
let managedModeOverride: boolean | null = null;
export function isManagedAuthEnabled() {
  return managedModeOverride ?? env.AUTH_PROVIDER === "supabase";
}
export function getAuthProvider() {
  return providerOverride ?? supabaseAuthProvider;
}
export function setAuthProviderForTests(provider: AuthProvider | null) {
  if (env.NODE_ENV !== "test") throw new Error("Auth provider override is test-only");
  providerOverride = provider;
}
export function setManagedAuthEnabledForTests(enabled: boolean | null) {
  if (env.NODE_ENV !== "test") throw new Error("Auth mode override is test-only");
  managedModeOverride = enabled;
}
