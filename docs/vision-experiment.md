# Shelf Vision: Pretrained Models vs LLM (experiment, Oct 11)

Question: can pretrained Hugging Face models replace an LLM for reading shelf photos?

## What we tried
Pipeline in `ml/` (RTX 5060, torch 2.11 cu128, transformers 5):
1. **OWLv2** (`google/owlv2-base-patch16-ensemble`) open-vocabulary detector finds product boxes.
2. **SigLIP** (`google/siglip-base-patch16-224`) embeds each crop and retrieves the nearest product from an index of 11,875 Open Food Facts India thumbnails.
3. Low-similarity boxes would be marked `needs_scan`.

Run on the first photos of the 29-photo shop set (cluttered kirana shelves, hanging sachets).

## Result
- **Identification fails.** Best crop-to-catalogue similarity was 0.896, median 0.77. Over thresholds 0.80 to 0.92 there is no value that separates correct from wrong. The highest-scoring "matches" were wrong (Omfed, Thandai, Pads, Peanut Snacks on a shelf of pest chalk, razors and bottles).
- **Why:** most of what this shop sells is not in Open Food Facts (local brands, non-food), and retrieval always returns the nearest wrong item instead of "unknown". 200 px catalogue thumbnails also differ a lot from shelf crops (angle, glare, plastic wrap).
- **Detection is usable but not countable.** OWLv2 found boxes (48 to 58 on dense photos) but they overlap and merge stacked packs, so counts such as the 24 High Power packs are not reliable. One photo returned 0 boxes.
- Not tested: OCR on crops (EasyOCR, Florence-2, or Indic OCR). It could help on readable labels, but it cannot fix catalogue coverage.

## Decision
- Keep the **LLM (Gemini) as the identification layer**: it reads brand, name and size from the label (it correctly read Laxman Rekha, Gillette Guard and Shingar, and counted about 24 High Power packs).
- Match the *text* it reads to the catalogue (`backend/scripts/match_detections.py`, fuzzy). Unmatched or low-confidence items become **needs_scan**, and scanned items enter the shared catalogue.
- Pretrained detectors remain an option only for cheap localisation or counting, not identity. Gemini flash cost at this scale is small, so the offline/free argument is weak.

## Caveats
- Judged by eye on a few photos and a similarity sweep, not against human-verified labels.
- Different models (a SKU-110K-trained detector, a larger embedding model, fine-tuning on Indian shelves) might do better; none was tried.

Reproduce: `ml/build_catalogue_index.py` then `ml/detect_and_match.py` (needs `ml/.venv`, see script docstrings).
