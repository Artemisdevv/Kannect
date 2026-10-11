// phone.email "Sign in with Phone": the owner enters their number, gets an SMS code, and the widget
// hands us a result URL. The server fetches the verified number itself, so nothing here is trusted.
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    phoneEmailListener?: (user: { user_json_url?: string }) => void;
  }
}

const SCRIPT = "https://www.phone.email/sign_in_button_v1.js";

export function PhoneEmailButton({
  clientId,
  onVerified,
}: {
  clientId: string;
  onVerified: (userJsonUrl: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const latest = useRef(onVerified);
  latest.current = onVerified;

  useEffect(() => {
    window.phoneEmailListener = (user) => {
      if (user?.user_json_url) latest.current(user.user_json_url);
    };
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    document.body.appendChild(script);
    return () => {
      script.remove();
      delete window.phoneEmailListener;
    };
  }, []);

  return <div ref={holder} className="pe_signin_button" data-client-id={clientId} />;
}
