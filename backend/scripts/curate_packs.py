"""Build starter packs from a hand-written list of kirana best-sellers.

Usage (from backend/):  python scripts/curate_packs.py

Each entry is looked up in the catalogue candidates (data/seed/off_candidates.jsonl) by fuzzy match
on brand + name + size, so the pack points at a real barcoded product. Writes
data/seed/packs/<shop_type>.json and prints every match with its score so a person can check them.

PRICES ARE DEMO VALUES. Open Food Facts has no prices. mrp_source says where each came from:
  web       a price seen on a retailer/brand page by search (see note), may be a selling price
  estimate  our rough guess of a typical Indian MRP, not looked up
Replace them with real MRPs from the packs before any real pilot.
"""

import json
import math
import re
from pathlib import Path

from rapidfuzz import fuzz, process

ROOT = Path(__file__).resolve().parents[2] / "data/seed"
OUT = ROOT / "packs"
G, P = "grocery", "provision"

# (packs, query "brand name size", price in rupees, mrp_source, note)
PACKAGED = [
    # biscuits
    ((G, P), "Parle Parle-G biscuit", 5, "web", "YourStory 2023: Rs 5 price point; BigBasket sells ~8.9"),
    ((G, P), "Britannia Good Day Cashew Cookies 52.5 g", 10, "estimate", ""),
    ((G, P), "Britannia Marie Gold Biscuit 64 g", 10, "estimate", ""),
    ((G,), "Britannia bourbon 50g", 10, "estimate", ""),
    ((G,), "Parle Hide & Seek 100g", 35, "estimate", ""),
    ((G,), "Parle Krackjack 56.7g", 10, "estimate", ""),
    ((G,), "Sunfeast Dark Fantasy 69 g", 40, "estimate", ""),
    ((G,), "Britannia Jimjam 57 g", 10, "estimate", ""),
    ((G, P), "Parle Monaco 200 g", 40, "estimate", ""),
    ((G,), "Tiger Krunch ChocoChips 60g", 10, "estimate", ""),
    # snacks
    ((G,), "Balaji wafers panjabi tadka 22g", 10, "estimate", ""),
    ((G,), "Balaji Wafers Simply Salted 30 g", 10, "estimate", ""),
    ((G,), "Kurkure Puffcorn 58 g", 20, "estimate", ""),
    ((G,), "Kurkure Masala Munch 44g", 10, "estimate", ""),
    ((G,), "Lay's Classics Salted 50g", 20, "estimate", ""),
    ((G,), "Lay's American Style Cream & Onion 24g", 10, "estimate", ""),
    ((G, P), "Haldiram's Aloo bhujia 200 gm", 55, "estimate", ""),
    ((G,), "Haldiram moong dal 200 g", 60, "estimate", ""),
    ((G,), "Bingo Potato Chips Chilli Sprinkled 90g", 40, "estimate", ""),
    # beverages
    ((G,), "Thums up 250 ml", 20, "estimate", ""),
    ((G,), "Thumsup 740ml", 40, "estimate", ""),
    ((G,), "Sprite 600 ml", 40, "estimate", ""),
    ((G,), "Pepsi 400ml", 30, "estimate", ""),
    ((G,), "Minute Maid Pulpy Orange 250ml", 30, "estimate", ""),
    ((G, P), "Aquafina Packaged Drinking Water 1 l", 20, "estimate", ""),
    ((G, P), "Bisleri Packaged Drinking Water 2L", 40, "estimate", ""),
    ((G,), "Frooti 125 ml", 10, "estimate", ""),
    ((G,), "Maaza Fruit drink 135ml", 10, "estimate", ""),
    # dairy
    ((G, P), "Amul Pasteurized Butter 100 g", 60, "web", "BigBasket lists MRP Rs 60 for the 100 g carton"),
    ((G,), "Amul Butter 200gm", 114, "estimate", ""),
    ((G, P), "Amul Taaza Milky Milk 500 ml", 29, "estimate", ""),
    ((G,), "Amul Masti Spiced Buttermilk 200mL", 15, "estimate", ""),
    ((G,), "Amul Lassi 200ml", 25, "estimate", ""),
    ((G,), "Amul Cheese slices 200 g", 140, "estimate", ""),
    ((P,), "Milma ghee 200ml", 160, "estimate", ""),
    ((P,), "Nandini Pure Ghee 500ml", 300, "estimate", ""),
    # instant food and condiments
    ((G, P), "Maggi noodles masala 70g", 14, "web", "BigBasket/StoreKing retail Rs 14-15; printed MRP not shown"),
    ((G,), "Sunfeast Yippee Noodles 72.6 g", 15, "estimate", ""),
    ((G,), "Kissan Fresh Tomato Ketchup 850 g", 140, "estimate", ""),
    ((G,), "Kissan Mixed Fruit Jam 200g", 120, "estimate", ""),
    ((G,), "Kissan fresh tomato 90g", 20, "estimate", ""),
    # staples and breakfast
    ((G, P), "Tata Salt 1 kg", 30, "web", "BigBasket Rs 22 vs Hyperpure/StoreKing Rs 30; sources conflict"),
    ((G, P), "Aashirvaad iodized salt 1kg", 28, "estimate", ""),
    ((G,), "Quaker oats 400g", 110, "estimate", ""),
    ((G,), "Saffola Masala Oats Classic Masala 38 g", 15, "estimate", ""),
    # chocolates
    ((G,), "Nestle Munch 17.4g", 10, "estimate", ""),
    ((G,), "Lotte Choco Pie 23g", 10, "estimate", ""),
    ((G,), "Cadbury Dairy Milk 13.2 g", 10, "estimate", ""),
    ((G,), "Cadbury 5star 25g", 20, "estimate", ""),
    # tea, coffee, malt drinks
    ((P,), "Tata Tea Chakra Gold 250g", 140, "estimate", ""),
    ((P,), "Brooke Bond Red Label 250g", 145, "estimate", ""),
    ((P,), "Brooke Bond 3 Roses Tea 100 g", 55, "estimate", ""),
    ((P,), "Taj Mahal tea 500 g", 400, "estimate", ""),
    ((P,), "Nescafe Classic Coffee 90g", 300, "estimate", ""),
    ((P,), "Bru Instant Coffee 50 g", 150, "estimate", ""),
    ((P,), "Horlicks Classic Malt 500 g", 290, "estimate", ""),
    ((P,), "Boost 500g", 290, "estimate", ""),
    ((P,), "Bournvita 500g", 270, "estimate", ""),
    ((P,), "Complan 500 g", 330, "estimate", ""),
    # atta, oil, staples
    ((P,), "Aashirvaad Shudh Chakki Atta 5 kg", 270, "estimate", ""),
    ((P,), "Aashirvaad Superior MP Atta 1 kg", 60, "estimate", ""),
    ((P,), "Fortune refined sunflower oil 1 l", 160, "estimate", ""),
    ((P,), "Fortune Rice Bran Oil 1L", 170, "estimate", ""),
    ((P,), "Fortune Premium kachi ghani pure mustard oil 1 L", 190, "estimate", ""),
    ((P,), "Parachute Coconut oil 200ml", 95, "estimate", ""),
    ((P,), "Saffola Oats 1kg", 200, "estimate", ""),
    ((P,), "Double Horse Semolina Roasted Rava 500 g", 50, "estimate", ""),
    # spices and masalas
    ((P,), "Everest Chaat Masala 50 g", 40, "estimate", ""),
    ((P,), "Everest Pav bhaji masala 50g", 40, "estimate", ""),
    ((P,), "Everest Sambhar Masala 50 g", 40, "estimate", ""),
    ((P,), "Everest sahi biryani Masala 50g", 45, "estimate", ""),
    ((P,), "MDH Kashmiri chilli powder 50gm", 55, "estimate", ""),
    ((P,), "MDH Black Pepper Powder 100g", 130, "estimate", ""),
    ((P,), "MDH biryani masala 50gm", 50, "estimate", ""),
    ((P,), "Eastern Chicken Masala 100g", 65, "estimate", ""),
    ((P,), "Eastern fish masala 100g", 65, "estimate", ""),
    ((P,), "Eastern Biryani Masala 100g", 70, "estimate", ""),
    ((P,), "MTR Sambar Powder 100 g", 60, "estimate", ""),
    ((P,), "Catch chat masala 100g", 70, "estimate", ""),
    ((P,), "Double Horse Garlic Pickle 200 g", 90, "estimate", ""),
    # household and personal care
    ((P,), "Colgate visible white 200g", 130, "estimate", ""),
    ((P,), "Cinthol soap 100g", 45, "estimate", ""),
    ((P,), "Harpic lemon fresh 500 ml", 100, "estimate", ""),
    ((P,), "Dettol Multi Surface Disinfectant 225ml", 60, "estimate", ""),
    ((P,), "Surf Excel 75 g", 10, "estimate", ""),
]

# Query -> exact barcode, for products the size filter or fuzzy match would miss or get wrong
FORCE = {
    "Parle Parle-G biscuit": "8901719134852",
    "Complan 500 g": "8901542001932",
}
# Query -> field overrides for sloppy crowd-sourced names/brands
FIX = {
    "Thumsup 740ml": {"name": "Thums Up", "brand": "Coca-Cola"},
    "Sprite 600 ml": {"brand": "Coca-Cola"},
    "Pepsi 400ml": {"brand": "Pepsi"},
    "Bru Instant Coffee 50 g": {"name": "Bru Instant Coffee"},
    "Aashirvaad Shudh Chakki Atta 5 kg": {"brand": "Aashirvaad"},
    "Cadbury Dairy Milk 13.2 g": {"brand": "Cadbury"},
    "Boost 500g": {"brand": "Boost"},
    "Nestle Munch 17.4g": {"name": "Munch"},
    "Cadbury 5star 25g": {"name": "5 Star"},
}

# Loose goods have no barcode. Prices are per kg (or per piece). name_ml needs a native-speaker check.
# (packs, name, name_ml, unit, price, category)
LOOSE = [
    ((G, P), "Matta rice", "മട്ട അരി", "gram", 60, "staples_grains"),
    ((G, P), "Raw rice (Pachari)", "പച്ചരി", "gram", 48, "staples_grains"),
    ((G, P), "Sugar", "പഞ്ചസാര", "gram", 45, "staples_grains"),
    ((G, P), "Wheat atta (loose)", "ഗോതമ്പ് പൊടി", "gram", 40, "staples_grains"),
    ((G, P), "Onion", "സവാള", "gram", 35, "fresh_produce"),
    ((G, P), "Potato", "ഉരുളക്കിഴങ്ങ്", "gram", 35, "fresh_produce"),
    ((G, P), "Tomato", "തക്കാളി", "gram", 40, "fresh_produce"),
    ((G, P), "Nendran banana", "ഏത്തപ്പഴം", "gram", 60, "fresh_produce"),
    ((G, P), "Coconut", "തേങ്ങ", "piece", 35, "fresh_produce"),
    ((G, P), "Egg", "മുട്ട", "piece", 7, "dairy_eggs"),
    ((P,), "Toor dal", "തുവരപ്പരിപ്പ്", "gram", 140, "staples_grains"),
    ((P,), "Moong dal", "ചെറുപയർ പരിപ്പ്", "gram", 120, "staples_grains"),
    ((P,), "Chana dal", "കടലപ്പരിപ്പ്", "gram", 90, "staples_grains"),
    ((P,), "Urad dal", "ഉഴുന്ന്", "gram", 120, "staples_grains"),
    ((P,), "Chilli powder (loose)", "മുളകുപൊടി", "gram", 400, "oils_spices"),
    ((P,), "Turmeric powder (loose)", "മഞ്ഞൾപ്പൊടി", "gram", 250, "oils_spices"),
    ((P,), "Coriander powder (loose)", "മല്ലിപ്പൊടി", "gram", 220, "oils_spices"),
]  # fmt: skip


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (s or "").lower()).strip()


def tidy(s: str) -> str:
    s = re.sub(r"\s+", " ", s or "").strip()
    return s.title() if s and (s.islower() or s.isupper()) else s


def main() -> None:
    cands = [json.loads(line) for line in (ROOT / "off_candidates.jsonl").open(encoding="utf-8")]
    by_code = {c["code"]: c for c in cands}
    cands = [c for c in cands if c["brands"] and re.search(r"[a-zA-Z]", c["quantity"] or "")]
    keys = [norm(f"{c['brands'].split(',')[0]} {c['product_name']} {c['quantity']}") for c in cands]

    packs: dict[str, list[dict]] = {G: [], P: []}
    weak = []
    for shop_types, query, price, src, note in PACKAGED:
        if query in FORCE:
            c, score = by_code[FORCE[query]], 100
        else:
            top = process.extract(norm(query), keys, scorer=fuzz.token_set_ratio, limit=5)
            # among near-equal matches prefer the more scanned (more real) record
            best_score = top[0][1]
            pool = [t for t in top if t[1] >= best_score - 4]
            _, score, idx = max(pool, key=lambda t: t[1] + math.log1p(cands[t[2]]["unique_scans_n"]))
            c = cands[idx]
        item = {
            "barcode": c["code"],
            "name": tidy(c["product_name"]),
            "name_ml": None,
            "brand": tidy(re.split(r" is sold by", c["brands"].split(",")[0])[0]),
            "size": c["quantity"] or None,
            "category": None,
            "unit": "piece",
            "mrp": price,
            "mrp_source": src,
            "mrp_note": note or None,
            "image_url": c["image_small_url"],
            "loose": False,
        }
        item.update(FIX.get(query, {}))
        flag = "" if score >= 95 else "  <-- CHECK"
        print(f"{score:5.0f}  {query[:44]:44} -> {c['brands'].split(',')[0][:14]} | {c['product_name'][:34]} | {c['quantity'][:10]}{flag}")  # fmt: skip
        if score < 95:
            weak.append(query)
        for st in shop_types:
            packs[st].append(item)

    for shop_types, name, name_ml, unit, price, cat in LOOSE:
        item = {
            "barcode": None, "name": name, "name_ml": name_ml, "brand": None, "size": None,
            "category": cat, "unit": unit, "mrp": price, "mrp_source": "estimate",
            "mrp_note": "per kg" if unit == "gram" else "per piece", "image_url": None, "loose": True,
        }  # fmt: skip
        for st in shop_types:
            packs[st].append(item)

    OUT.mkdir(parents=True, exist_ok=True)
    for st, items in packs.items():
        (OUT / f"{st}.json").write_text(
            json.dumps({"shop_type": st, "price_note": "Demo prices, see mrp_source", "items": items},
                       ensure_ascii=False, indent=1),
            encoding="utf-8",
        )  # fmt: skip
        print(f"{st}: {len(items)} items ({sum(i['loose'] for i in items)} loose)")
    if weak:
        print("\nweak matches to check:", len(weak))


if __name__ == "__main__":
    main()
