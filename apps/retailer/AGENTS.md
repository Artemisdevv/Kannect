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

## KadaNet architecture
- Keep shared retailer screen UI in `src/components/kadanet` and define a leaf route for each bottom-navigation destination, so screens have independent URLs and metadata.
- Keep the current experience explicitly demo-only and in memory until an API contract is provided; UI confirmations must never claim live persistence or synchronization.
- Define retailer visual styling through semantic tokens in `src/styles.css` and use shadcn controls with at least 48px touch targets.
