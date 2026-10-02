"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";

import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { apiRequest, ApiError } from "@/lib/api/client";

type Factor = { id: string; friendlyName: string | null };
type FactorsResponse = { factors: Factor[]; pendingFactors: Factor[]; assuranceLevel: string | null };
type Enrollment = { factorId: string; secret: string; uri: string; qrCode: string };

export default function OperatorMfaPage() {
  const { user, loading, refreshUser } = useCurrentUser();
  const [factors, setFactors] = useState<FactorsResponse | null>(null);
  const [selectedFactor, setSelectedFactor] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (loading || user?.role !== "admin") return;
    let active = true;
    void apiRequest<FactorsResponse>("/v1/auth/mfa/factors")
      .then((result) => {
        if (!active) return;
        setFactors(result);
        setSelectedFactor(result.factors[0]?.id ?? result.pendingFactors[0]?.id ?? "");
        setReady(result.assuranceLevel === "aal2");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof ApiError && cause.code === "OPERATOR_ACCESS_REVOKED"
          ? "This account is not on the current operator allowlist."
          : "Authenticator setup is unavailable. Retry when managed sign-in is ready.");
      });
    return () => { active = false; };
  }, [loading, retryCount, user?.role]);

  useEffect(() => {
    if (enrollment) codeInput.current?.focus();
  }, [enrollment]);

  async function startSetup(replacePendingFactorId?: string) {
    setBusy(true);
    setError("");
    try {
      const next = await apiRequest<Enrollment>("/v1/auth/mfa/enroll", {
        method: "POST", body: JSON.stringify(replacePendingFactorId ? { replacePendingFactorId } : {}),
      });
      setEnrollment(next);
      setSelectedFactor(next.factorId);
      setConfirmReplacement(false);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.code === "MFA_SETUP_PENDING" || cause.code === "MFA_SETUP_CHANGED")) {
        setRetryCount((count) => count + 1);
      }
      setError(cause instanceof ApiError && cause.code === "MFA_SETUP_PENDING"
        ? "Your unfinished setup is still available. Enter its code, or explicitly replace it if you lost the QR code."
        : cause instanceof ApiError && cause.code === "MFA_SETUP_CHANGED"
          ? "Authenticator setup changed. Review the current factor before trying again."
          : cause instanceof ApiError && cause.code === "AUTH_RATE_LIMITED"
            ? "Too many attempts. Wait a little before trying again."
            : "Could not start authenticator setup. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFactor || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError("");
    try {
      const challenge = await apiRequest<{ challengeId: string }>("/v1/auth/mfa/challenge", {
        method: "POST", body: JSON.stringify({ factorId: selectedFactor }),
      });
      await apiRequest("/v1/auth/mfa/verify", {
        method: "POST", body: JSON.stringify({ factorId: selectedFactor, challengeId: challenge.challengeId, code }),
      });
      setCode("");
      setEnrollment(null);
      setReady(true);
      try {
        await refreshUser();
      } catch {
        setError("Authenticator verified. Account status could not refresh yet; try opening the workspace.");
      }
    } catch (cause) {
      setCode("");
      setError(cause instanceof ApiError && cause.code === "MFA_CODE_INVALID"
        ? "That code was invalid or expired. Enter the current code and try again."
        : cause instanceof ApiError && cause.code === "AUTH_RATE_LIMITED"
          ? "Too many attempts. Wait a little before trying again."
        : "Could not verify this code. Check your connection and try again.");
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="operator-workspace"><p role="status">Checking your account…</p></div>;
  if (!user) return <div className="operator-workspace"><p>Sign in before setting up operator MFA. <Link href="/login">Sign in</Link></p></div>;
  if (user.role !== "admin") return <div className="operator-workspace"><p role="alert">Operator account required.</p></div>;

  return <div className="operator-workspace operator-mfa">
    <div className="operator-heading"><div><span className="operator-kicker">OPERATIONS / ACCOUNT ACCESS</span>
      <h1>Secure your shift.</h1>
      <p>An authenticator code adds the second check required before operator queues open.</p>
    </div><span className="product-status product-status-restricted">Operator access</span></div>
    <section className="operator-panel" aria-labelledby="mfa-heading">
      <div className="operator-panel-head"><span>01 / AUTHENTICATOR</span><h2 id="mfa-heading">Two-step sign-in</h2>
        <p>Use a TOTP authenticator app. Your account must also remain on the current operator allowlist.</p></div>
      {error && <p role="alert" className="operator-notice operator-error">{error}</p>}
      {ready ? <div className="operator-case"><p>Authenticator verified for this session.</p>
        <Link href="/operator">Continue to operator workspace</Link></div> : !factors ?
        error ? <button type="button" onClick={() => { setError(""); setRetryCount((count) => count + 1); }}>Retry status</button> :
        <p role="status">Loading authenticator status…</p> : <>
          {!enrollment && factors.factors.length === 0 && factors.pendingFactors.length === 0 && <div className="operator-case">
            <h3>Connect an authenticator</h3>
            <p>Keep the app open for the next step. The setup secret appears here only until you leave this page.</p>
            <button type="button" disabled={busy} onClick={() => void startSetup()}>Set up authenticator</button>
          </div>}
          {!enrollment && factors.pendingFactors.length > 0 && <div className="operator-case">
            <h3>Unfinished authenticator setup</h3>
            <p>If you already scanned the QR code, enter the current code below to finish setup. This factor remains available after a retry.</p>
            {!confirmReplacement ? <button type="button" disabled={busy}
              onClick={() => setConfirmReplacement(true)}>Replace unfinished setup</button> : <>
              <p role="alert">If you replace this setup, the old authenticator code will stop working.</p>
              <button type="button" disabled={busy}
                onClick={() => void startSetup(factors.pendingFactors[0].id)}>Discard unfinished setup and create a new secret</button>
              <button type="button" disabled={busy} onClick={() => setConfirmReplacement(false)}>Keep current setup</button>
            </>}
          </div>}
          {enrollment && <div className="operator-case">
            <h3>Scan, then confirm</h3>
            <p>Scan this QR code in your authenticator app. If scanning fails, enter the secret manually.</p>
            <Image className="operator-mfa-qr" alt="Authenticator setup QR code" width={220} height={220} unoptimized
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qrCode)}`} />
            <p className="operator-mfa-secret"><strong>Manual setup secret</strong><br /><code>{enrollment.secret}</code></p>
            <p>Keep this secret private. Do not send it to support or paste it in chat.</p>
          </div>}
          {factors.factors.length > 0 && !enrollment && <div className="operator-case">
            <label htmlFor="operator-factor">Authenticator</label><br />
            <select id="operator-factor" value={selectedFactor} onChange={(event) => setSelectedFactor(event.target.value)}>
              {factors.factors.map((factor) => <option key={factor.id} value={factor.id}>
                {factor.friendlyName || "Authenticator"}</option>)}
              {factors.pendingFactors.map((factor) => <option key={factor.id} value={factor.id}>
                {factor.friendlyName || "Authenticator"} (unfinished setup)</option>)}
            </select>
          </div>}
          {(enrollment || factors.factors.length > 0 || factors.pendingFactors.length > 0) && <form aria-label="Verify authenticator" onSubmit={(event) => void verify(event)} className="operator-case">
            <label htmlFor="operator-mfa-code">Six-digit authenticator code</label><br />
            <input ref={codeInput} id="operator-mfa-code" name="code" type="text" inputMode="numeric"
              autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }} disabled={busy} />
            <p>Press Enter or select the button to verify this session.</p>
            <button type="submit" disabled={busy || code.length !== 6}>Verify and continue</button>
          </form>}
        </>}
    </section>
  </div>;
}
