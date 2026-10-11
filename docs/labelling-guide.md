# Labelling guide: shelf-photo evaluation

For whoever labels the 29 shop photos (Asif). The goal is real precision and recall numbers for the pitch, so they must come from **a person looking at the photos**, not from another AI. Whoever labels is named on the slide.

## What you need
- The photos: `data/*.jpeg` (29 of them, same shop).
- The system's output: `data/eval/labeling_sheet.csv` (499 rows, one per item the system read) and `data/eval/missed_items.csv` (empty, you fill it).
- Open both CSVs in Excel or Google Sheets. Save as **CSV UTF-8**, same file names.

**Do not run `python scripts/eval_shelf.py sheet` again.** It regenerates the sheet and wipes your labels.

## Columns in labeling_sheet.csv
| Column | What it is | You edit it? |
|---|---|---|
| `image` | photo file name | no |
| `label` | what the system says it saw (brand, name, size) | no |
| `visible_count` | how many of that item the system counted | no (counts are not scored) |
| `gemini_confidence` | the model's own 0-1 confidence | no |
| `status` | `strong` auto-matched, `weak` has alternatives, `uncertain` hedged, `no_match` not in catalogue, `loose_tile`/`loose_no_tile` loose goods | no |
| `suggested_product`, `alternative_1/2` | catalogue products the system proposes | no |
| **`read_ok`** | **y/n: is this item really on the shelf in that photo?** | **yes** |
| **`match_ok`** | **y/n: only if `suggested_product` is filled. Is it the right product?** | **yes** |
| `true_product` | what the item really is, when the read or the suggestion is wrong | yes |
| `notes` | why it failed (blurry, hidden, wrong variant, not a product...) | yes |

## Method (do it blind first, then compare)
Labelling straight from the sheet is biased: you tend to agree with what is listed. For a fair recall number, write your own list first.

**Step 1. Pick photos.** Label whole photos, not scattered rows. Eight photos is the minimum for usable numbers; more is better. Pick a mix (clear and cluttered). Note the file names.

**Step 2. Blind list, per photo.** Open the photo and, *before* looking at the sheet rows for it, write down every product you can identify (brand + product + size if readable). Zoom in. Count a product once however many packs you see. Put it in your own file `data/eval/my_truth.csv` with columns `image,product`. If you can't tell what something is, don't list it.

**Step 3. Compare against the sheet.** Filter `labeling_sheet.csv` to that photo's `image`. For each row:
1. Is that item in your blind list, or clearly visible when you look again?
   - yes -> `read_ok = y`
   - no, or it is a guess, a different product, or not a product -> `read_ok = n`, and say why in `notes`.
2. If `suggested_product` is filled and `read_ok = y`: is the suggestion the **same brand and the same variant/flavour**? yes -> `match_ok = y`. Wrong variant (for example Parle-G vs Parle-G Gold) or wrong product -> `match_ok = n`, and put the correct name in `true_product`.
3. If `read_ok = y` but there is no suggestion, optionally fill `true_product` with the real product name. Leave `match_ok` empty.
4. Duplicates: if the sheet lists the same product twice, label both rows `y` if both are real (the score will count it once per row; note "duplicate" in `notes`).

**Step 4. Missed items.** Every product in your blind list that has **no matching row** in the sheet goes into `data/eval/missed_items.csv` as `image,product`. Only do this for photos you fully labelled, otherwise recall is wrong.

**Step 5. Leave unlabelled rows empty.** Rows from photos you did not label stay blank. The scorer ignores them.

## Rules of thumb
- Judge the product on the shelf, not the price or the count.
- Same brand, different size is a different product. Say `n` on `match_ok` only if brand or variant differs; if only the size differs, write it in `notes` and mark `n`.
- Loose goods (rice sacks, vegetables, eggs): `read_ok = y` if that item is there. `match_ok` is empty unless a tile product is suggested and it is the right one.
- When unsure whether something is on the shelf, zoom in once; if still unsure, mark `n` and write "unsure" in `notes`. Don't guess `y`.
- Don't use another AI to label. If anything was pre-labelled by an AI, say so on the slide, and have a person verify at least two or three photos and report how often they agree.

## Score it
From the repo root:
```
cd backend
python scripts/eval_shelf.py score
```
It prints:
- **reading precision**: of the labelled rows, share with `read_ok = y`.
- **reading recall**: correct reads out of correct reads plus your `missed_items` list.
- **reading F1**: the two combined.
- **catalogue match precision**: of auto-suggested rows you checked, share with `match_ok = y`. Only quote this with the denominator ("12 of 15 suggestions") because it is a small sample.
- share of correct reads needing a barcode scan, average confidence on right vs wrong reads, the weakest photos, and the list of wrong reads for failure analysis.

## What to put on the slide
- Number of photos labelled, number of rows, who labelled them, and that it is one small shop.
- Reading precision, recall and F1; match precision with its denominator.
- The honest framing from [vision-results.md](./vision-results.md): the pretrained Hugging Face approach failed on real shelves, so the system uses Gemini plus a barcode fallback; about two thirds of the shop's goods are not in the catalogue; no shopkeeper interviews were done; all prices are demo values.
