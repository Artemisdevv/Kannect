import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, authConfig, createShop, isSignedIn, requestOtp, signIn, signInWithPhoneEmail } from "@/api";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { PhoneEmailButton } from "./phone-email-button";
import { LIMITS, parsePhone, tidy, validateShop, type ShopErrors } from "@/lib/validation";

const SHOP_TYPES = [
  ["grocery", "Grocery"],
  ["provision", "Provision store"],
  ["vegetable", "Vegetables"],
  ["bakery", "Bakery"],
  ["stationery", "Stationery"],
  ["general", "General store"],
] as const;

type Step = "phone" | "otp" | "shop";

function errorText(e: unknown) {
  return e instanceof ApiError ? e.message : "Could not reach the server. Check your connection.";
}

export function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(isSignedIn() ? "shop" : "phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  // Which login the server wants. If it cannot be reached we fall back to the demo form, which
  // shows its own error when the server is down.
  const config = useQuery({ queryKey: ["auth", "config"], queryFn: authConfig, retry: 1 });
  const realLogin = config.data?.otp_provider === "phone_email" && !showDemo;
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [errors, setErrors] = useState<ShopErrors>({});
  const [shop, setShop] = useState({
    name: "",
    owner_name: "",
    address: "",
    shop_type: "grocery" as (typeof SHOP_TYPES)[number][0],
  });

  const parsed = parsePhone(phone);
  const e164 = () => parsed.e164 ?? "";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = () =>
    run(async () => {
      await requestOtp(e164());
      setStep("otp");
    });

  const verify = () =>
    run(async () => {
      const session = await signIn(e164(), otp);
      if (session.shop) await navigate({ to: "/" });
      else setStep("shop");
    });

  const verifiedByPhoneEmail = (url: string) =>
    run(async () => {
      const session = await signInWithPhoneEmail(url);
      if (session.shop) await navigate({ to: "/" });
      else setStep("shop");
    });

  const register = () => {
    const found = validateShop(shop);
    setErrors(found);
    if (Object.keys(found).length > 0) return Promise.resolve();
    return run(async () => {
      const location = await currentLocation();
      await createShop({
        name: tidy(shop.name),
        shop_type: shop.shop_type,
        ...(tidy(shop.owner_name) ? { owner_name: tidy(shop.owner_name) } : {}),
        ...(tidy(shop.address) ? { address: tidy(shop.address) } : {}),
        language: "en",
        ...(location ? { location } : {}),
      });
      await navigate({ to: "/onboard" });
    });
  };

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="mt-10 mb-6 flex items-center gap-3">
          <span className="brand-mark">
            <Store size={23} />
          </span>
          <div>
            <h1 className="m-0">Kannect</h1>
            <p className="eyebrow">Retailer</p>
          </div>
        </div>

        {step === "phone" && realLogin && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Sign in with your phone</h2>
            <p className="text-sm text-muted-foreground">
              We send a code by SMS to confirm your number.
            </p>
            {config.data?.phone_email_client_id && (
              <PhoneEmailButton clientId={config.data.phone_email_client_id} onVerified={(url) => void verifiedByPhoneEmail(url)} />
            )}
            {busy ? (
              <p className="text-sm text-muted-foreground">Signing you in…</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                A small window opens to check your number. If it stays on “Verifying…”, switch off your
                browser's ad-blocker or shields for this site and try again.
              </p>
            )}
            <Button type="button" variant="ghost" className="w-full" onClick={() => setShowDemo(true)}>
              Demo shop login (test accounts only)
            </Button>
          </div>
        )}

        {step === "phone" && !realLogin && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void sendOtp();
            }}
          >
            <h2 className="text-lg font-semibold">Sign in with your phone</h2>
            <label className="text-sm" htmlFor="phone">
              Mobile number
            </label>
            <input
              id="phone"
              className="page-search"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              aria-invalid={phoneTouched && Boolean(parsed.error)}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhoneTouched(true)}
            />
            {phoneTouched && parsed.error && <p className="text-xs text-destructive">{parsed.error}</p>}
            <Button className="w-full" disabled={busy || Boolean(parsed.error)}>
              {busy ? "Sending…" : "Send code"}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <h2 className="text-lg font-semibold">Enter the code</h2>
            <p className="text-sm text-muted-foreground">Sent to {e164()}</p>
            <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button className="w-full" disabled={busy || otp.length < 6}>
              {busy ? "Checking…" : "Sign in"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("phone")}>
              Use a different number
            </Button>
          </form>
        )}

        {step === "shop" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void register();
            }}
          >
            <h2 className="text-lg font-semibold">Set up your shop</h2>
            <div>
              <input
                className="page-search"
                aria-label="Shop name"
                placeholder="Shop name"
                maxLength={LIMITS.shopName.max}
                aria-invalid={Boolean(errors.name)}
                value={shop.name}
                onChange={(e) => setShop({ ...shop, name: e.target.value })}
                onBlur={() => setErrors(validateShop(shop))}
              />
              {errors.name && <p className="text-xs text-destructive mt-1 px-2">{errors.name}</p>}
            </div>
            <div>
              <input
                className="page-search"
                aria-label="Your name"
                placeholder="Your name (optional)"
                maxLength={LIMITS.ownerName.max}
                aria-invalid={Boolean(errors.owner_name)}
                value={shop.owner_name}
                onChange={(e) => setShop({ ...shop, owner_name: e.target.value })}
                onBlur={() => setErrors(validateShop(shop))}
              />
              {errors.owner_name && <p className="text-xs text-destructive mt-1 px-2">{errors.owner_name}</p>}
            </div>
            <div>
              <input
                className="page-search"
                aria-label="Address"
                placeholder="Area or address (optional)"
                maxLength={LIMITS.address.max}
                aria-invalid={Boolean(errors.address)}
                value={shop.address}
                onChange={(e) => setShop({ ...shop, address: e.target.value })}
                onBlur={() => setErrors(validateShop(shop))}
              />
              {errors.address && <p className="text-xs text-destructive mt-1 px-2">{errors.address}</p>}
            </div>
            <select
              className="page-search"
              aria-label="Shop type"
              value={shop.shop_type}
              onChange={(e) =>
                setShop({ ...shop, shop_type: e.target.value as typeof shop.shop_type })
              }
            >
              {SHOP_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              We use your phone's location so nearby shoppers can find you. If you decline, you
              can add it later.
            </p>
            <Button className="w-full" disabled={busy}>
              {busy ? "Creating…" : "Create shop"}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}

function currentLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 },
    );
  });
}
