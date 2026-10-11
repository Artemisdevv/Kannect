import { useNavigate } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, createShop, isSignedIn, requestOtp, signIn } from "@/api";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

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
  const [shop, setShop] = useState({
    name: "",
    owner_name: "",
    address: "",
    shop_type: "grocery" as (typeof SHOP_TYPES)[number][0],
  });

  const e164 = () => {
    const digits = phone.replace(/\D/g, "");
    return digits.length === 10 ? `+91${digits}` : `+${digits}`;
  };

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

  const register = () =>
    run(async () => {
      const location = await currentLocation();
      await createShop({
        ...shop,
        language: "en",
        ...(location ? { location } : {}),
      });
      await navigate({ to: "/onboard" });
    });

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

        {step === "phone" && (
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
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button className="w-full" disabled={busy || phone.replace(/\D/g, "").length < 10}>
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
            <input
              className="page-search"
              aria-label="Shop name"
              placeholder="Shop name"
              value={shop.name}
              onChange={(e) => setShop({ ...shop, name: e.target.value })}
            />
            <input
              className="page-search"
              aria-label="Your name"
              placeholder="Your name"
              value={shop.owner_name}
              onChange={(e) => setShop({ ...shop, owner_name: e.target.value })}
            />
            <input
              className="page-search"
              aria-label="Address"
              placeholder="Area or address"
              value={shop.address}
              onChange={(e) => setShop({ ...shop, address: e.target.value })}
            />
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
            <Button className="w-full" disabled={busy || !shop.name.trim()}>
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
