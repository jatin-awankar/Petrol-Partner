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

export interface TotpFactor { id: string; friendlyName: string | null }
export interface TotpEnrollment { factorId: string; secret: string; uri: string; qrCode: string }

export interface AuthProvider {
  register(input: { email: string; password: string; fullName: string; college?: string; pkceChallenge: string }): Promise<void>;
  login(email: string, password: string): Promise<ProviderSession>;
  validate(accessToken: string): Promise<ProviderIdentity>;
  refresh(refreshToken: string): Promise<ProviderSession>;
  requestRecovery(email: string, pkceChallenge: string): Promise<void>;
  exchangeCode(code: string, verifier: string): Promise<ProviderSession>;
  updatePassword(accessToken: string, password: string): Promise<void>;
  logout(accessToken: string): Promise<void>;
  listTotpFactors?(accessToken: string): Promise<TotpFactor[]>;
  enrollTotp?(accessToken: string): Promise<TotpEnrollment>;
  challengeTotp?(accessToken: string, factorId: string): Promise<{ challengeId: string }>;
  verifyTotp?(accessToken: string, factorId: string, challengeId: string, code: string): Promise<ProviderSession>;
}

function providerError(status: number, body: unknown): never {
  const providerMessage =
    typeof body === "object" && body && "msg" in body ? String(body.msg) : "Authentication provider rejected the request";
  if (status >= 500) {
    throw new AppError(503, "Authentication assurance is temporarily unavailable", "AUTH_ASSURANCE_UNAVAILABLE");
  }
  if (status === 429) {
    throw new AppError(429, "Too many authentication attempts. Try again later", "AUTH_RATE_LIMITED");
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

function assuranceLevelFromToken(accessToken?: string) {
  if (!accessToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.aal === "string" ? payload.aal : null;
  } catch {
    return null;
  }
}

function identityFromUser(user: any, accessToken?: string): ProviderIdentity {
  return {
    subject: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
    assuranceLevel: assuranceLevelFromToken(accessToken),
    userMetadata: user.user_metadata ?? {},
  };
}

function sessionFromBody(body: any): ProviderSession {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in,
    identity: identityFromUser(body.user, body.access_token),
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
        code_challenge: input.pkceChallenge,
        code_challenge_method: "s256",
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
    return identityFromUser(user, accessToken);
  },
  async refresh(refreshToken) {
    return sessionFromBody(await requestProvider("/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }));
  },
  async requestRecovery(email, pkceChallenge) {
    const recoveryCallback = new URL(env.AUTH_CALLBACK_URL!);
    recoveryCallback.searchParams.set("next", "recovery");
    await requestProvider("/recover", {
      method: "POST",
      body: JSON.stringify({ email, redirect_to: recoveryCallback.toString(), code_challenge: pkceChallenge, code_challenge_method: "s256" }),
    });
  },
  async exchangeCode(code, verifier) {
    return sessionFromBody(await requestProvider("/token?grant_type=pkce", {
      method: "POST",
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    }));
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
  async listTotpFactors(accessToken) {
    const user = await requestProvider("/user", { headers: { Authorization: `Bearer ${accessToken}` } });
    return (Array.isArray(user.factors) ? user.factors : [])
      .filter((factor: any) => factor.factor_type === "totp" && factor.status === "verified")
      .map((factor: any) => ({ id: factor.id, friendlyName: factor.friendly_name ?? null }));
  },
  async enrollTotp(accessToken) {
    const user = await requestProvider("/user", { headers: { Authorization: `Bearer ${accessToken}` } });
    for (const factor of Array.isArray(user.factors) ? user.factors : []) {
      if (factor.factor_type !== "totp" || factor.status !== "unverified" || typeof factor.id !== "string") continue;
      await requestProvider(`/factors/${encodeURIComponent(factor.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
    const enrolled = await requestProvider("/factors", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ factor_type: "totp", friendly_name: "Operator authenticator" }),
    });
    if (typeof enrolled.id !== "string" || typeof enrolled.totp?.secret !== "string" ||
        typeof enrolled.totp?.uri !== "string" || typeof enrolled.totp?.qr_code !== "string") {
      throw new AppError(503, "MFA provider returned an invalid setup response", "AUTH_ASSURANCE_UNAVAILABLE");
    }
    return { factorId: enrolled.id, secret: enrolled.totp.secret, uri: enrolled.totp.uri, qrCode: enrolled.totp.qr_code };
  },
  async challengeTotp(accessToken, factorId) {
    const challenge = await requestProvider(`/factors/${factorId}/challenge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({}),
    });
    if (typeof challenge.id !== "string") {
      throw new AppError(503, "MFA provider returned an invalid challenge", "AUTH_ASSURANCE_UNAVAILABLE");
    }
    return { challengeId: challenge.id };
  },
  async verifyTotp(accessToken, factorId, challengeId, code) {
    let verified: any;
    try {
      verified = await requestProvider(`/factors/${factorId}/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ challenge_id: challengeId, code }),
      });
    } catch (error) {
      if (error instanceof AppError && error.code === "INVALID_CREDENTIALS") {
        throw new AppError(400, "Invalid or expired authenticator code", "MFA_CODE_INVALID");
      }
      throw error;
    }
    if (typeof verified.access_token !== "string" || typeof verified.refresh_token !== "string" ||
        typeof verified.expires_in !== "number" || typeof verified.user?.id !== "string") {
      throw new AppError(503, "MFA provider returned an invalid session", "AUTH_ASSURANCE_UNAVAILABLE");
    }
    return sessionFromBody(verified);
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
