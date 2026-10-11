import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { api } from "@/lib/api/service";
import { IS_DEMO } from "@/lib/api/client";
import { DEMO_OTP } from "@/lib/api/demo";
import { errorText } from "@/components/kn/states";
import { useSession } from "@/lib/session";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/login")({
  head: () => seo("Sign in", "Sign in to KadaNet Supplier with your mobile number and a one-time code."),
  component: Login,
});

function Login() {
  const { session, ready, signIn } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (ready && session) navigate({ to: "/", replace: true });
  }, [ready, session, navigate]);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const full = `+91${phone}`;

  async function send() {
    setErr(null);
    if (!/^[6-9]\d{9}$/.test(phone)) return setErr("Enter a valid 10-digit Indian mobile number.");
    setBusy(true);
    try {
      const r = await api.requestOtp(full);
      setStep("otp");
      setOtp("");
      setTimer(r.resendAfterSeconds ?? 30);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setErr(null);
    if (otp.length !== 6) return setErr("Enter the 6-digit code.");
    setBusy(true);
    try {
      const s = await api.verifyOtp(full, otp);
      if (s.role !== "supplier") {
        setErr("This number isn't registered as a supplier. Use the KadaNet app for your role.");
        return;
      }
      signIn(s);
      navigate({ to: "/", replace: true });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell flex flex-col px-6 py-10">
      <img src="/icon-192.png" alt="KadaNet" width={64} height={64} className="rounded-[18px]" />
      <p className="eyebrow mt-6">KadaNet Supplier</p>
      <h1>{step === "phone" ? "Sign in with your mobile" : "Enter the code"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {step === "phone"
          ? "For distributors and wholesalers supplying local shops."
          : `We sent a 6-digit code to +91 ${phone}.`}
      </p>

      {IS_DEMO && (
        <div className="mt-5 rounded-[18px] bg-warning-surface px-4 py-3 text-sm text-warning">
          Demo mode: no server is connected. Use any valid number and code <b>{DEMO_OTP}</b> (or 000000 to see the expired message).
        </div>
      )}

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => { e.preventDefault(); step === "phone" ? send() : verify(); }}
      >
        {step === "phone" ? (
          <div className="space-y-2">
            <Label htmlFor="phone">Mobile number</Label>
            <div className="flex items-center gap-2">
              <span className="flex min-h-12 items-center rounded-[18px] border border-input bg-card px-4 text-muted-foreground">+91</span>
              <Input
                id="phone" inputMode="numeric" autoComplete="tel-national" maxLength={10}
                value={phone} aria-invalid={!!err} aria-describedby={err ? "login-err" : undefined}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="98470 12345"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="otp">One-time code</Label>
            <InputOTP id="otp" maxLength={6} value={otp} onChange={setOtp} autoFocus>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="h-12 w-11 bg-elevated text-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}

        {err && <p id="login-err" role="alert" className="text-sm font-medium text-destructive">{err}</p>}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {step === "phone" ? "Send code" : "Verify and sign in"}
        </Button>

        {step === "otp" && (
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={() => { setStep("phone"); setErr(null); }}>
              <ArrowLeft /> Change number
            </Button>
            <Button type="button" variant="ghost" disabled={timer > 0 || busy} onClick={send}>
              {timer > 0 ? `Resend in ${timer}s` : "Resend code"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
