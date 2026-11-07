"use client";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabase, cloudError } from "@/lib/supabase";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
export function MfaForm({
  enrolled,
  onVerified,
}: {
  enrolled: boolean;
  onVerified: () => void | Promise<void>;
}) {
  const [factor, setFactor] = useState("");
  const [verifiedFactor, setVerifiedFactor] = useState(enrolled);
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  useEffect(() => {
    let active = true;
    void getSupabase()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setFeedback({ type: "error", message: cloudError(error) });
        else {
          setVerifiedFactor(data.totp.length > 0);
          setFactor(
            data.totp.find((item) => item.status === "verified")?.id ?? "",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function enroll() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const client = getSupabase();
      const existing = await client.auth.mfa.listFactors();
      if (existing.error) throw existing.error;
      if (existing.data.totp.some((item) => item.status === "verified")) {
        setVerifiedFactor(true);
        setFactor(
          existing.data.totp.find((item) => item.status === "verified")!.id,
        );
        return;
      }
      for (const item of existing.data.all.filter(
        (item) => item.factor_type === "totp" && item.status === "unverified",
      )) {
        const removed = await client.auth.mfa.unenroll({ factorId: item.id });
        if (removed.error) throw removed.error;
      }
      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Management Laboratory",
        issuer: "Management Laboratory",
      });
      if (error) throw error;
      setFactor(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (error) {
      setFeedback({ type: "error", message: cloudError(error) });
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFeedback(null);
    if (!/^\d{6}$/.test(code)) {
      setFeedback({
        type: "error",
        message: "Введите шестизначный код из приложения.",
      });
      return;
    }
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.mfa.challengeAndVerify({
        factorId: factor,
        code,
      });
      if (error) throw error;
      setSecret("");
      setQr("");
      setCode("");
      await onVerified();
    } catch (error) {
      setFeedback({ type: "error", message: cloudError(error) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="security-mfa" onChangeCapture={() => setFeedback(null)}>
      <h3>{verifiedFactor ? "Код подтверждения" : "Двухфакторная защита"}</h3>
      <p className="teacher-hint">
        {verifiedFactor
          ? "Введите код из приложения-аутентификатора."
          : "Добавьте аккаунт в приложение-аутентификатор. После настройки для входа потребуется одноразовый код."}
      </p>
      {!verifiedFactor && !qr && (
        <button
          type="button"
          className="teacher-button"
          disabled={busy}
          onClick={() => void enroll()}
        >
          Настроить 2FA
        </button>
      )}
      {qr && (
        <div className="security-mfa-setup">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            width={200}
            height={200}
            alt="QR-код настройки двухфакторной защиты"
          />
          <label>
            Ключ для ручного добавления
            <input
              readOnly
              value={secret}
              autoComplete="off"
              aria-label="Секрет настройки 2FA"
            />
          </label>
          <p className="teacher-hint">
            Сохраните ключ в надёжном месте. Он нужен для восстановления
            приложения-аутентификатора.
          </p>
        </div>
      )}
      {factor && (verifiedFactor || qr) && (
        <form noValidate onSubmit={verify}>
          <label htmlFor="mfa-code">
            Код из приложения
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ""))
              }
              disabled={busy}
            />
          </label>
          <button
            className="teacher-button primary"
            type="submit"
            disabled={busy}
          >
            {busy ? "Проверяем…" : "Подтвердить"}
          </button>
        </form>
      )}
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </section>
  );
}
