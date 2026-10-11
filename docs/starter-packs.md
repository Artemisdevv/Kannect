# Starter Packs

First packs for two shop types, used by onboarding path 3 (tick the pictures of what you sell). See [onboarding.md](./onboarding.md).

| Pack | Items | Packaged (barcoded) | Loose tiles |
|---|---|---|---|
| `grocery` | 57 | 47 | 10 |
| `provision` | 67 | 50 | 17 |

Files: `data/seed/packs/grocery.json`, `data/seed/packs/provision.json`.

## Where things come from
- **Packaged items** are real products from the Open Food Facts India catalogue (real barcodes, names, pack sizes, images). Each was matched by a hand-written list of kirana best-sellers (`backend/scripts/curate_packs.py`) and the matches were checked.
- **Loose tiles** (rice, sugar, onion, coconut, eggs, dals...) have no barcode and no image. Shreyas should give each a picture or icon. `name_ml` (Malayalam) is a first draft and **needs a native-speaker check**.
- **Not covered:** Open Food Facts has few household and personal-care items, and no unbranded staples. Items we wanted but could not find stay out of the pack instead of being invented.

## Prices are demo values
Open Food Facts has no prices and we have no real MRPs. Every price carries `mrp_source`:

| `mrp_source` | Meaning | Count |
|---|---|---|
| `web` | Seen on a retailer or brand page by search (note in `mrp_note`). May be a selling price, not the printed MRP. | 4 (Parle-G, Amul Butter 100 g, Maggi 70 g, Tata Salt 1 kg) |
| `estimate` | Our rough guess of a typical Indian MRP. Not looked up. | the rest |

Even the `web` ones disagree between sources (Tata Salt 1 kg: Rs 22 vs Rs 30), so treat all of them as placeholders. **Do not present them as verified prices.** Loose-item prices are per kg (or per piece for coconut and eggs).

## Replacing prices (Asif or anyone)
1. Edit `mrp` and set `mrp_source` to e.g. `verified` (and `mrp_note`, e.g. "read from pack, 11 Oct") in the pack JSON.
2. From `backend/`: `python scripts/load_packs.py --reprice` (dry run), then add `--apply`.

The pack prices are copied into `product.mrp` in the database. There is no source column there, so the pack JSON is the record of where each price came from.

## Still to do
- Pack **membership** (which product belongs to which shop type) needs the `starter_pack_item` table and `GET /catalogue/starter-packs` from issue #37. Until then the JSON files are the source of truth.
- More packs: `vegetable`, `stationery`, `bakery`, `general`.
