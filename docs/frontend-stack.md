# Frontend Stack: Prebuilt Components, Lovable-Friendly

Four sites (landing, consumer, retailer, supplier), see [apps.md](./apps.md). All share this stack and one theme.

Rule: **use prebuilt components, do not hand-build UI.** Fast to ship and easy to generate in Lovable.

| Concern | Choice |
|---|---|
| Framework | React + Vite + TypeScript (Lovable's default, so generated code drops straight in) |
| UI components | **shadcn/ui** (Radix primitives) + Tailwind CSS |
| Icons | lucide-react |
| Toasts / dialogs / sheets | shadcn `sonner`, `dialog`, `drawer`/`sheet` (use `drawer` for mobile bottom sheets) |
| Forms | react-hook-form + zod (shadcn `form`) |
| Server state | TanStack Query |
| API client | generated from `docs/openapi.yaml` (`openapi-typescript` + `openapi-fetch`) |
| Offline | Workbox / vite-plugin-pwa + Dexie |
| Barcode (PWA) | `@zxing/browser`; Capacitor build swaps to `@capacitor-mlkit/barcode-scanning` behind one `scan()` wrapper |
| Map | Leaflet + OpenStreetMap tiles (react-leaflet) |
| i18n | i18next, Malayalam + English, font Noto Sans Malayalam |
| Android | Capacitor (Adnan) |

## shadcn components we expect to use

`button`, `card`, `input`, `input-otp` (login), `badge` (In stock / Low / Out), `tabs`, `drawer`, `dialog`, `command` (item search), `toggle-group` (plenty / some / few, quick amounts 250 g / 500 g / 1 kg), `select`, `sheet`, `skeleton`, `sonner`, `table`, `scroll-area`.

## Design rules

- Theme with Tailwind/shadcn CSS variables only. No custom component CSS unless unavoidable.
- Touch targets at least 48 px. Large primary action buttons. High contrast for bright shop lighting.
- Status colours always paired with text/icon (not colour alone).
- Rupees displayed as `₹1,234.50`.
- Every list screen has loading, empty and error states (use `skeleton`).

## Lovable workflow

1. Prompt Lovable screen by screen, naming shadcn components and pasting the relevant schema from `openapi.yaml`.
2. Keep generated code in `app/` (or the agreed frontend dir), with a thin `api/` layer so swapping mock to real is one env var (`VITE_API_URL`).
3. Review generated code for hard-coded data and replace with API calls.
4. Commit often. Lovable pushes to GitHub, so agree the branch (for example `frontend`) to avoid clashing with backend work.
