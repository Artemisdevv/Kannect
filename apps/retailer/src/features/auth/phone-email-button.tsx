// phone.email "Sign in with Phone": the owner enters their number, gets an SMS code, and phone.email
// tells us the result. The server fetches the verified number itself, so nothing here is trusted.
// The button the widget draws is restyled in src/styles.css (.pe_signin_button).
//
// How the widget works (read from its script): the button opens a popup on auth.phone.email; when
// the code is verified the popup posts a message to this page with a `user_json_url`. The widget then
// fetches that URL in the browser and calls window.phoneEmailListener. That browser-side fetch can be
// blocked (ad blockers, Brave Shields, CORS), and then nothing would happen here, so we also listen
// for the message ourselves and hand the URL straight to the server.
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    phoneEmailListener?: (user: { user_json_url?: string }) => void;
  }
}

const SCRIPT = "https://www.phone.email/sign_in_button_v1.js";
const POPUP_ORIGIN = "https://auth.phone.email";
const LABEL = "Continue with phone number";

// A result URL is good for one login, and both paths below can report the same one.
const handled = new Set<string>();

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
    const deliver = (url: unknown) => {
      if (typeof url !== "string" || !url.startsWith("https://") || handled.has(url)) return;
      handled.add(url);
      latest.current(url);
    };

    window.phoneEmailListener = (user) => deliver(user?.user_json_url);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== POPUP_ORIGIN) return;
      const data = event.data as { user_json_url?: unknown } | null;
      if (data && typeof data === "object") deliver(data.user_json_url);
    };
    window.addEventListener("message", onMessage);

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
      window.removeEventListener("message", onMessage);
      watcher.disconnect();
      script.remove();
      delete window.phoneEmailListener;
    };
  }, []);

  return <div ref={holder} className="pe_signin_button" data-client-id={clientId} />;
}
