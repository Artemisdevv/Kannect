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

- All backend calls go through src/lib/api/service.ts → client.ts; when VITE_API_URL is unset, client.ts routes to labelled demo fixtures in demo.ts — keeps fixtures swappable for the real API.
- Business rules (order transitions, demand ≥3-shop threshold) live in src/lib/rules.ts with tests — single source the UI and demo share.
