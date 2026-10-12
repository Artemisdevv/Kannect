"""Embed catalogue product images (Open Food Facts thumbnails) with SigLIP.

Usage (from repo root):  ml/.venv/Scripts/python ml/build_catalogue_index.py [--limit 0]

Reads  data/seed/off_candidates.jsonl
Writes ml/cache/catalogue_emb.npy   (N x D, L2-normalised image embeddings)
       ml/cache/catalogue_txt.npy   (N x D, L2-normalised text embeddings of "brand name size")
       ml/cache/catalogue_meta.json (row metadata aligned with the arrays)

Thumbnails are cached in ml/cache/img/ so reruns are cheap. Missing/failed images are dropped.
Data: Open Food Facts (ODbL / CC-BY-SA images).
"""

import argparse
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import AutoModel, AutoProcessor

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "ml" / "cache"
IMG = CACHE / "img"
MODEL = "google/siglip-base-patch16-224"


def as_tensor(x):
    """transformers 5 returns an output object, older versions a tensor."""
    return x if isinstance(x, torch.Tensor) else x.pooler_output


def fetch(item: dict) -> Path | None:
    dest = IMG / f"{item['code']}.jpg"
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    try:
        req = urllib.request.Request(item["image_small_url"], headers={"User-Agent": "കnnect-hackathon/0.1"})
        with urllib.request.urlopen(req, timeout=20) as r:
            dest.write_bytes(r.read())
        return dest
    except Exception:
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--batch", type=int, default=64)
    args = ap.parse_args()

    IMG.mkdir(parents=True, exist_ok=True)
    items = [json.loads(line) for line in (ROOT / "data/seed/off_candidates.jsonl").open(encoding="utf-8")]
    if args.limit:
        items = items[: args.limit]

    print(f"downloading {len(items)} thumbnails...", flush=True)
    with ThreadPoolExecutor(16) as ex:
        paths = list(ex.map(fetch, items))
    keep = [(it, p) for it, p in zip(items, paths, strict=True) if p]
    print(f"{len(keep)} thumbnails available", flush=True)

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = AutoModel.from_pretrained(MODEL).to(dev).eval()
    proc = AutoProcessor.from_pretrained(MODEL)

    img_embs, txt_embs, meta = [], [], []
    with torch.no_grad():
        for i in range(0, len(keep), args.batch):
            chunk = keep[i : i + args.batch]
            imgs, ok = [], []
            for it, p in chunk:
                try:
                    imgs.append(Image.open(p).convert("RGB"))
                    ok.append(it)
                except Exception:
                    continue
            if not imgs:
                continue
            inp = proc(images=imgs, return_tensors="pt").to(dev)
            e = as_tensor(model.get_image_features(**inp))
            img_embs.append(torch.nn.functional.normalize(e, dim=-1).cpu().numpy())
            texts = [f"{it['brands']} {it['product_name']} {it['quantity']}".strip() for it in ok]
            tin = proc(text=texts, padding="max_length", max_length=64, truncation=True, return_tensors="pt").to(dev)
            t = as_tensor(model.get_text_features(**tin))
            txt_embs.append(torch.nn.functional.normalize(t, dim=-1).cpu().numpy())
            meta.extend(
                {k: it[k] for k in ("code", "product_name", "brands", "quantity", "categories_tags", "unique_scans_n")}
                for it in ok
            )
            print(f"embedded {len(meta)}/{len(keep)}", flush=True)

    np.save(CACHE / "catalogue_emb.npy", np.concatenate(img_embs).astype("float32"))
    np.save(CACHE / "catalogue_txt.npy", np.concatenate(txt_embs).astype("float32"))
    (CACHE / "catalogue_meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    print(f"done: {len(meta)} products indexed")


if __name__ == "__main__":
    main()
