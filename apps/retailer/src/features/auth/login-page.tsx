import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, authConfig, createShop, isSignedIn, requestOtp, signIn, signInWithPhoneEmail } from "@/api";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { LanguageSwitcher } from "@/components/kannect/language-switcher";
import { shopTypeLabel } from "@/lib/format";
import { getCurrentPoint } from "@/lib/location";
import { t, tf, useLocale, type Locale } from "@/lib/i18n";
import { PhoneEmailButton } from "./phone-email-button";
import { LIMITS, parsePhone, tidy, validateShop, type ShopErrors } from "@/lib/validation";

const SHOP_TYPES = ["grocery", "provision", "vegetable", "bakery", "stationery", "general"] as const;

const BRAND = "Kannect"; // the name is the logo's alt text, not a translated string

type Step = "phone" | "otp" | "shop";

function errorText(e: unknown, locale: Locale) {
  return e instanceof ApiError ? e.message : t("Could not reach the server. Check your connection.", locale);
}

export function LoginPage() {
  const locale = useLocale();
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
    shop_type: "grocery" as (typeof SHOP_TYPES)[number],
  });

  const parsed = parsePhone(phone, locale);
  const e164 = () => parsed.e164 ?? "";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errorText(e, locale));
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
    const found = validateShop(shop, locale);
    setErrors(found);
    if (Object.keys(found).length > 0) return Promise.resolve();
    return run(async () => {
      const location = await currentLocation();
      await createShop({
        name: tidy(shop.name),
        shop_type: shop.shop_type,
        ...(tidy(shop.owner_name) ? { owner_name: tidy(shop.owner_name) } : {}),
        ...(tidy(shop.address) ? { address: tidy(shop.address) } : {}),
        language: locale,
        ...(location ? { location } : {}),
      });
      await navigate({ to: "/onboard" });
    });
  };

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="mt-6 mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="m-0">
              <img src="/kannect-logo.png" alt={BRAND} className="brand-logo" />
            </h1>
            <span className="brand-caption">{t("Retailer", locale)}</span>
          </div>
          <LanguageSwitcher />
        </div>

        {step === "phone" && realLogin && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t("Sign in with your phone", locale)}</h2>
            <p className="text-sm text-muted-foreground">
              {t("We send a code by SMS to confirm your number.", locale)}
            </p>
            {config.data?.phone_email_client_id && (
              <PhoneEmailButton clientId={config.data.phone_email_client_id} onVerified={(url) => void verifiedByPhoneEmail(url)} />
            )}
            {busy ? (
              <p className="text-sm text-muted-foreground">{t("Signing you in…", locale)}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("A small window opens to check your number. If it stays on “Verifying…”, switch off your browser's ad-blocker or shields for this site and try again.", locale)}
              </p>
            )}
            <Button type="button" variant="ghost" className="w-full" onClick={() => setShowDemo(true)}>
              {t("Demo shop login (test accounts only)", locale)}
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
            <h2 className="text-lg font-semibold">{t("Sign in with your phone", locale)}</h2>
            <label className="text-sm" htmlFor="phone">
              {t("Mobile number", locale)}
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
              {busy ? t("Sending…", locale) : t("Send code", locale)}
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
            <h2 className="text-lg font-semibold">{t("Enter the code", locale)}</h2>
            <p className="text-sm text-muted-foreground">{tf("Sent to {phone}", { phone: e164() }, locale)}</p>
            <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button className="w-full" disabled={busy || otp.length < 6}>
              {busy ? t("Checking…", locale) : t("Sign in", locale)}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("phone")}>
              {t("Use a different number", locale)}
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
            <h2 className="text-lg font-semibold">{t("Set up your shop", locale)}</h2>
            <div>
              <input
                className="page-search"
                aria-label={t("Shop name", locale)}
                placeholder={t("Shop name", locale)}
                maxLength={LIMITS.shopName.max}
                aria-invalid={Boolean(errors.name)}
                value={shop.name}
                onChange={(e) => setShop({ ...shop, name: e.target.value })}
                onBlur={() => setErrors(validateShop(shop, locale))}
              />
              {errors.name && <p className="text-xs text-destructive mt-1 px-2">{errors.name}</p>}
            </div>
            <div>
              <input
                className="page-search"
                aria-label={t("Your name", locale)}
                placeholder={t("Your name (optional)", locale)}
                maxLength={LIMITS.ownerName.max}
                aria-invalid={Boolean(errors.owner_name)}
                value={shop.owner_name}
                onChange={(e) => setShop({ ...shop, owner_name: e.target.value })}
                onBlur={() => setErrors(validateShop(shop, locale))}
              />
              {errors.owner_name && <p className="text-xs text-destructive mt-1 px-2">{errors.owner_name}</p>}
            </div>
            <div>
              <input
                className="page-search"
                aria-label={t("Address", locale)}
                placeholder={t("Area or address (optional)", locale)}
                maxLength={LIMITS.address.max}
                aria-invalid={Boolean(errors.address)}
                value={shop.address}
                onChange={(e) => setShop({ ...shop, address: e.target.value })}
                onBlur={() => setErrors(validateShop(shop, locale))}
              />
              {errors.address && <p className="text-xs text-destructive mt-1 px-2">{errors.address}</p>}
            </div>
            <select
              className="page-search kn-select"
              aria-label={t("Shop type", locale)}
              value={shop.shop_type}
              onChange={(e) =>
                setShop({ ...shop, shop_type: e.target.value as typeof shop.shop_type })
              }
            >
              {SHOP_TYPES.map((value) => (
                <option key={value} value={value}>
                  {shopTypeLabel(value, locale)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("We use your phone's location so nearby shoppers can find you. If you decline, you can add it later.", locale)}
            </p>
            <Button className="w-full" disabled={busy}>
              {busy ? t("Creating…", locale) : t("Create shop", locale)}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}

async function currentLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { lat, lng } = await getCurrentPoint();
    return { lat, lng };
  } catch {
    return null; // the shop can still be created; the owner adds the location later from More
  }
}
