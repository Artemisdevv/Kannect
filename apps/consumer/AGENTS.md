<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep consumer API transport and demo fixtures behind `src/lib/shopper.ts`; a live transport requires the supplied contract so endpoints are never invented.
- Use the shared shopper shell for ephemeral search/location state; only public results can be session-cached so precise shopper coordinates are never persisted.
- Implement consumer destinations with TanStack leaf routes and per-page metadata so shop and privacy pages are directly addressable.
- Keep discovery and product search in separate leaf routes; use exact router-owned dock selection and invalidate pending searches on reset so navigation never restores stale results.
- Use semantic global design tokens and shadcn controls so the shared brand and touch geometry remain consistent.
- Generate the app-shell service worker with vite-plugin-pwa and register solely through the guarded wrapper so preview and development never become cached apps.
