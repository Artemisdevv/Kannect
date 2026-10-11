# Phone verification (real OTP)

Two modes, chosen by one setting on the API: `OTP_PROVIDER`.

| Mode | What it does | Use for |
|---|---|---|
| `demo` (default) | The fixed `DEMO_OTP` logs in any number. | local development, the pitch demo |
| `phone_email` | Real SMS verification through [phone.email](https://www.phone.email). The demo OTP then works **only** for the fictional demo numbers (`+91900000…`, so the demo shops stay loginable). | pilots, real shopkeepers |

## Why phone.email, and the limits
- India is supported. **1000 free SMS a month for the first 6 months** (per their pricing page), then about
  **$0.14 (about ₹12) per SMS**, which is expensive for a shop app. Check current pricing before relying on it.
- The OTP SMS template cannot be changed and shows your business name.
- If the free SMS run out, do not fall back to `OTP_PROVIDER=demo` for real users: anyone could log in as anyone.
  Switch provider (Firebase Phone Auth, MSG91 with DLT registration) instead. The login code is behind
  `/auth/config`, so only `backend/app/routers/auth.py` and the login button change.

## How it works
1. The app asks `GET /auth/config`. If `otp_provider` is `phone_email`, it shows the phone.email button
   (client id from `phone_email_client_id`).
2. The owner enters their number and the SMS code inside the phone.email widget.
3. The widget gives the app a result URL (`user_json_url`). The app sends it to
   `POST /auth/phone-email/verify`.
4. The server only accepts an `https` URL on an allowed host (`PHONE_EMAIL_HOSTS`, default `user.phone.email`),
   fetches the verified number itself (no redirects, short timeout, size cap), and issues the normal login token.
   Each result URL works once per server instance.

The client never sends a phone number that the server trusts; the number always comes from phone.email's own host.

## Setup (needs a person: creating the account is not something the app can do)
1. Sign up at https://www.phone.email, open the Admin Dashboard and create a "Sign in with Phone" button.
   Note the **client id** in the button code.
2. Check the generated button snippet against `apps/retailer/src/features/auth/phone-email-button.tsx`
   (script URL `https://www.phone.email/sign_in_button_v1.js`, element class `pe_signin_button`, attribute
   `data-client-id`, callback `window.phoneEmailListener`). If the dashboard snippet differs, change that one file.
3. Set on the API (Render environment):
   ```
   OTP_PROVIDER=phone_email
   PHONE_EMAIL_CLIENT_ID=<client id>
   ```
   Optional: `PHONE_EMAIL_HOSTS` (comma separated), `DEMO_PHONE_PREFIX` (default `+91900000`).
4. In the phone.email dashboard, add your app's origins to the allowed domains (the deployed web app, and
   `https://localhost` for the Android app) if it asks for them.

## Not verified yet
- No client id was available when this was written, so the end-to-end flow against the real service has not been
  run. The server side is covered by tests with a faked provider (URL allowlist, one-time use, role rules, flag off/on).
- The widget opens a popup or redirect. Inside the Android WebView that may need extra handling; test it on a phone
  before promising it. If it does not work there, use a provider with an SDK for native apps (Firebase Phone Auth).
- One-time use is tracked in memory per server instance, so a restart or a second instance forgets it. phone.email
  result URLs are unguessable, which is what protects them; add a database table if that is not enough.
