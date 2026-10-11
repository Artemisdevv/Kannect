// phone.email "Sign in with Phone": the owner enters their number, gets an SMS code, and the widget
// hands us a result URL. The server fetches the verified number itself, so nothing here is trusted.
// The button the widget draws is restyled in src/styles.css (.pe_signin_button).
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    phoneEmailListener?: (user: { user_json_url?: string }) => void;
  }
}

const SCRIPT = "https://www.phone.email/sign_in_button_v1.js";
const LABEL = "Continue with phone number";

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

    // The widget writes its own label ("Sign in with Phone"); use ours so it reads like the app.
    const relabel = () => {
      const text = holder.current?.querySelector("#btn_ph_login_text");
      if (text && text.textContent !== LABEL) text.textContent = LABEL;
    };
    const watcher = new MutationObserver(relabel);
    if (holder.current) watcher.observe(holder.current, { childList: true, subtree: true, characterData: true });
    relabel();

    return () => {
      watcher.disconnect();
      script.remove();
      delete window.phoneEmailListener;
    };
  }, []);

  return <div ref={holder} className="pe_signin_button" data-client-id={clientId} />;
}
