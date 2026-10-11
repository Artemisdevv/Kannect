# Shop Onboarding: Photo First, Scan to Make It Exact

**Constraint:** we cannot interview shopkeepers right now. Nothing here is validated with real shops. State that honestly in the pitch (see "Validation without interviews" below). Do not invent quotes.

## Design goal: least manual work

Most billing apps die at setup because the owner must type an item list and counts. Ours minimises that to a few taps. This is a judging point, so demo it.

## Likely status quo (assumption, not verified)

From general knowledge of Indian kirana shops: stock is in the owner's head and on the shelf, tracked via supplier bills and notebooks, restocked "by eye". Treat this as a hypothesis. Desk research backs it (see Asif's issue).

## The onboarding flow

### 1. Shelf photo (one shot, headline feature)
1. Owner photographs a shelf, a counter, or up to 6 photos (`POST /shop/ai/shelf-photo`).
2. A vision model reads packaging (brand, name, size) and counts visible units. Detections are matched to the shared catalogue.
3. App shows a **confirm list**: each row = product picture + name + estimated count. Owner taps ✓ to accept, taps the row to swap a wrong match (alternatives shown) or fix the number.
4. Rows the AI is unsure about show **"Scan this one"** (see 2).
5. One tap saves all via `POST /shop/products/bulk` with `count_source: photo_estimate`.

**What photos can and cannot do (be honest):**
- Good at: which products are present, brand/size from the front label, counting visible facings.
- Weak at: items hidden behind the front row, stacked cartons, loose goods in sacks, dark or blurry photos. So the count is an estimate, shown as a *level* (plenty/some/few) plus a number the owner can correct.
- Photo-estimated counts are tagged and **recounted first** in the weekly recount, so errors self-correct.
- App checks `image_quality` and asks for a retake when blurry, dark or too far.

### 2. Scan one, type how many (exact, 2 taps per item)
For accuracy, or for items photo missed:
1. Scan the barcode (name, image, MRP auto-fill from catalogue).
2. Big number pad + quick chips (+1, +6, +12, "case"). Optionally speak the number (voice, nice-to-have).
3. Save, camera reopens for the next item. Continuous loop, no typing of names or prices.
4. Saved as `count_source: owner_exact`.

Combine freely: photo for breadth, scan+count for the fast movers where exactness matters.

### 3. Starter pack (fallback when the camera is not convenient)
Pick shop type, tap pictures of items you sell, choose plenty/some/few. See `GET /catalogue/starter-packs`.

### 4. Add on first sale (safety net)
An unknown item at the till is added automatically when billed. No setup stands between the owner and a sale. Stock may go negative and gets flagged for recount.

### 5. Supplier invoice photo (nice-to-have)
Same pattern as shelf photo, reading bill lines instead (`POST /shop/ai/invoice`).

### Loose items
Photo cannot count rice in a sack. Loose items come from the starter pack tiles with plenty/some/few, then weekly recount by weight.

## Accuracy loop (why the estimates are safe)
`count_source` is stored on every stock event: `owner_exact` > `photo_estimate` > `level_guess`. Shoppers only ever see In stock / Low / Out. The weekly recount prioritises low-confidence sources, so photo estimates converge to real counts after one pass.

## Validation without interviews
Replace interviews with evidence we can gather ourselves, and say plainly what is still untested:
- **AI accuracy test set:** Asif gathers 20-30 shelf photos (own photos at a nearby shop with the owner's permission to take a picture, or public images). Adnan scores detection and count accuracy: item recall, match accuracy, count error. Report the real number on a slide. This is a genuine validation of the riskiest AI claim.
- **Time-to-onboard:** a teammate or family member runs onboarding on a real shelf (home pantry works). Time it and count taps. Report it as a prototype test, not a shopkeeper study.
- **Desk research:** cite named public sources on kirana stock practice, billing app adoption, ONDC. Every statistic needs a source.
- **Pitch wording:** "We could not interview shopkeepers yet. These are hypotheses, and our pilot plan tests them" (already Section 8 of `winning_solution.md`).

## What each person does

| Person | Task |
|---|---|
| Shreyas | Shelf photo capture (camera + upload), confirm list UI (shadcn), swap-match drawer, "Scan this one" hand-off, scan+count screen with number pad and chips. Starter-pack grid as fallback. |
| Aswin | `POST /shop/products/bulk` with `count_source` and `stock_level` mapping, store source on stock events, recount ordering by source, auto-add on bill. |
| Adnan | `POST /shop/ai/shelf-photo` (vision LLM, JSON extraction, catalogue fuzzy match, image quality check), seed catalogue so matches succeed on demo shelves, accuracy scoring on the test set. |
| Asif | Shelf photo test set, desk research with sources, onboarding timing test, honest validation slides. |
