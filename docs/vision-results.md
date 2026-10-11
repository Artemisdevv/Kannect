# Shelf Photo Results (29 photos)

Written for the pitch and for Asif's validation questions. **Read the first section before quoting any number.**

## What we can and cannot claim

| Question | Answer |
|---|---|
| Precision / recall / F1 of product identification | **Not measured yet.** Nobody has verified the 29 photos against the real shelves. Any such number now would be invented. Section "How to get the real numbers" fixes this. |
| How many photos "matched correctly" | **Not measurable yet** for the same reason. What we can say is how many produced an automatic catalogue match (below). |
| Confidence score | We have only the model's **self-reported** confidence. It is not calibrated and is unreliable (see below). |

## What we measured (no human labels needed)

Run on all 29 photos of one small shop, Gemini reading each photo, then matched against the loaded catalogue (11,603 products) with the shipped matching logic.

| Measure | Result |
|---|---|
| Items the model listed | 329 raw, **297** after merging repeats and dropping unnamed |
| Loose goods (no barcode) | 12 |
| Flagged unreadable by the model | 95 (32%) |
| **Readable packaged items** | **190** |
| Auto-matched to one catalogue product ("strong") | **17** (9% of readable) |
| Shown with alternatives, owner picks ("weak") | 48 (25%) |
| **No catalogue entry, needs a barcode scan** | **125 (66%)** |
| Photos with at least one auto-match | 9 of 29 |
| Mean self-reported confidence | 76% over all items, 85% over readable ones |

**Biggest finding:** two thirds of what this shop sells is not in our catalogue (Open Food Facts). Local brands (Nirapara, Saravana, Deepam, Laxman Rekha, High Power chalk) and non-food goods are the gap. The barcode scan fallback is not an edge case here, it is the main path. Growing the catalogue (every scan adds to it) matters more than a better model.

## Quality of the automatic matches (my review, not human-verified)

I read every auto-match and judged whether the catalogue product is the one the label names. This is judgement from names only: I did not check each against its photo, and it assumes the model read the label correctly.

| Matcher version | Auto-matches | Looked correct | Precision |
|---|---|---|---|
| First version | 41 | 32 | 78% |
| After tightening (below) | 17 | 16 | **94%** |

The remaining wrong one: "Aachi Mango Pickle" matched "Aachi Mango Ginger Pickle" (right brand, wrong variant).

Errors found in the first version and the fix for each:
- Bare brand picked one arbitrary product ("PARLE" matched Happy Happy) -> a brand-only reading is auto-accepted only if the phrase is in exactly one product's name.
- 1-2 letter "brands" ("Z", "CM") matched a random product -> never auto-accepted.
- Ties resolved arbitrarily (Parle-G matched Happy Happy) -> ties now go to the closest whole string.
- Ambiguous names ("Oreo" biscuit vs "Cornetto Oreo" ice cream) -> shown as alternatives, not auto-picked.

The trade-off is fewer auto-matches (41 down to 17). The owner still sees every row and confirms it, so the cost of a wrong auto-match is a wrong confirmation, while the cost of a skipped one is one extra tap.

## Hugging Face pipeline vs Gemini

- The Hugging Face pipeline (OWLv2 detection, SigLIP matching against catalogue images) was run on **3 photos only** (106 crops). It has **no accuracy number** because there are no labels. Observed: best similarity 0.896, median 0.77, no threshold separated right from wrong, and the top "matches" were visibly wrong (Omfed, Thandai, Pads on a shelf of pest chalk and razors). Detection found boxes but merged stacked packs, so counts were unreliable.
- Gemini read brands correctly in every case I checked by eye (Laxman Rekha, Gillette Guard, Shingar, Haldiram's, Lay's, Aachi, Chandrika). Not scored against labels.
- A "Gemini fallback" pipeline was **not built**: the HF side was not good enough to be the primary. **Gemini is the only identification layer; there is no comparison table to report.** What can be said honestly: "we tested pretrained retrieval on real kirana shelves, it did not work, so we use a vision LLM and a barcode fallback." Details in [vision-experiment.md](./vision-experiment.md).

## Failure patterns observed

1. **Catalogue coverage** (by far the largest): local brands and non-food items have no entry.
2. **Generic items the model cannot name**: "small bottles", "small toys", "snacks", "personal care product" (mostly flagged unreadable, which is the right behaviour).
3. **Variant mismatch**: right brand, wrong flavour or size (Aachi pickles, Good Day variants).
4. **Brand-only readings**, where the model returned just "Parle" or "Aachi" with no product name.
5. **Run-to-run variation**: the same photo returned 5 items in one run and 2 in another.
6. **Quality self-report is useless**: the model rated all 29 photos "good". We check blur, darkness and size ourselves instead (thresholds tuned on these photos plus synthetic blur).
7. Not yet checked by a human: counts (for example about 24 High Power packs on one photo looked right to me, nothing more).

No analysis here shows lighting or blur as a cause: all 29 photos were sharp and evenly lit, so those risks are untested on real poor-quality phone photos.

## How to get the real numbers (for Asif)

A labelling sheet is ready: `data/eval/labeling_sheet.csv` (one row per item the system read, 297 rows) plus an empty `data/eval/missed_items.csv`.

1. Open each photo (file name is in the `image` column) and fill, per row: `read_ok` (y/n: is that product really on the shelf), `match_ok` (y/n, only where a `suggested_product` is shown: same brand and variant), `true_product` when the suggestion is wrong or missing, `notes` for the failure reason.
2. In `missed_items.csv` add one line per product visible in the photo that has no row.
3. Label a few whole photos completely rather than a few rows from many. Even 8 photos gives usable numbers. Only list missed items for photos whose rows you labelled.
4. From `backend/` run `python scripts/eval_shelf.py score`. It prints reading precision, recall and F1, catalogue match precision, the share needing a scan, average confidence on right vs wrong readings, the weakest photos and the list of wrong readings for failure analysis.

Report those numbers on the slide together with how many photos were labelled and by whom.
