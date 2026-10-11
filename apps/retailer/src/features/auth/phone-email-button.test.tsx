import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhoneEmailButton } from "./phone-email-button";

afterEach(cleanup);

const send = (origin: string, data: unknown) =>
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { origin, data }));
  });

const URL1 = "https://user.phone.email/user_abc123def456.json";

describe("PhoneEmailButton", () => {
  it("renders the container the widget fills, with the client id", () => {
    const { container } = render(<PhoneEmailButton clientId="CID" onVerified={() => {}} />);
    const holder = container.querySelector(".pe_signin_button");
    expect(holder?.getAttribute("data-client-id")).toBe("CID");
  });

  it("passes the result URL from phone.email's popup to the app once, even if reported twice", () => {
    const onVerified = vi.fn();
    render(<PhoneEmailButton clientId="CID" onVerified={onVerified} />);
    send("https://auth.phone.email", { flag_phone: "1", user_json_url: URL1 });
    // the widget's own listener reports the same URL as well
    act(() => window.phoneEmailListener?.({ user_json_url: URL1 }));
    expect(onVerified).toHaveBeenCalledTimes(1);
    expect(onVerified).toHaveBeenCalledWith(URL1);
  });

  it("ignores messages from any other origin", () => {
    const onVerified = vi.fn();
    render(<PhoneEmailButton clientId="CID" onVerified={onVerified} />);
    send("https://evil.example.com", { user_json_url: "https://user.phone.email/user_evil000000.json" });
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("ignores results that are not https URLs", () => {
    const onVerified = vi.fn();
    render(<PhoneEmailButton clientId="CID" onVerified={onVerified} />);
    send("https://auth.phone.email", { user_json_url: "http://user.phone.email/user_plain000000.json" });
    send("https://auth.phone.email", { user_json_url: 42 });
    send("https://auth.phone.email", "hello");
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("stops listening when the screen goes away", () => {
    const onVerified = vi.fn();
    const { unmount } = render(<PhoneEmailButton clientId="CID" onVerified={onVerified} />);
    unmount();
    send("https://auth.phone.email", { user_json_url: "https://user.phone.email/user_after000000.json" });
    expect(onVerified).not.toHaveBeenCalled();
  });
});
