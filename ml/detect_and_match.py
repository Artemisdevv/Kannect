"""Hybrid shelf pipeline, pretrained models only (no LLM):

  1. OWLv2 open-vocabulary detector finds product-like boxes (this is what gives real counts)
  2. SigLIP embeds each crop and retrieves the nearest catalogue products (image-image + image-text)
  3. Boxes with a low retrieval score are marked needs_scan (barcode fallback), not guessed

Usage (repo root):
    ml/.venv/Scripts/python ml/detect_and_match.py [--limit 3] [--det-thr 0.15]

Needs ml/cache/catalogue_*.npy from build_catalogue_index.py.
Writes ml/out/hf_detections.jsonl and annotated images in ml/out/annotated/.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageOps
from torchvision.ops import nms
from transformers import AutoModel, AutoProcessor, Owlv2ForObjectDetection, Owlv2Processor

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "ml" / "cache"
OUT = ROOT / "ml" / "out"
DET_MODEL = "google/owlv2-base-patch16-ensemble"
EMB_MODEL = "google/siglip-base-patch16-224"
QUERIES = ["a packaged product", "a box", "a bottle", "a pouch", "a packet", "a tube"]


def load_images(folder: Path, limit: int) -> list[Path]:
    paths = sorted(p for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    return paths[:limit] if limit else paths


@torch.no_grad()
def detect(det, dproc, img: Image.Image, dev: str, thr: float, iou: float, min_frac: float):
    inputs = dproc(text=[QUERIES], images=img, return_tensors="pt").to(dev)
    out = det(**inputs)
    side = max(img.size)  # OWLv2 pads to a square; boxes are relative to it
    res = dproc.post_process_object_detection(out, threshold=thr, target_sizes=torch.tensor([(side, side)]).to(dev))[0]
    boxes, scores = res["boxes"], res["scores"]
    w, h = img.size
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clamp(0, w)
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clamp(0, h)
    area = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    keep = (area > min_frac * w * h) & (area < 0.5 * w * h)  # drop specks and whole-shelf boxes
    boxes, scores = boxes[keep], scores[keep]
    k = nms(boxes, scores, iou)
    return boxes[k].cpu().numpy(), scores[k].cpu().numpy()


@torch.no_grad()
def embed_crops(emb, eproc, crops: list[Image.Image], dev: str) -> np.ndarray:
    out = []
    for i in range(0, len(crops), 32):
        inp = eproc(images=crops[i : i + 32], return_tensors="pt").to(dev)
        e = emb.get_image_features(**inp)
        out.append(torch.nn.functional.normalize(e, dim=-1).cpu().numpy())
    return np.concatenate(out) if out else np.zeros((0, 768), dtype="float32")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", default=str(ROOT / "data"))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--det-thr", type=float, default=0.15)
    ap.add_argument("--iou", type=float, default=0.4)
    ap.add_argument("--min-frac", type=float, default=0.0015, help="min box area as a fraction of the image")
    ap.add_argument("--match-thr", type=float, default=0.80, help="image-image cosine needed to accept a match")
    args = ap.parse_args()

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    cat_img = np.load(CACHE / "catalogue_emb.npy")
    cat_txt = np.load(CACHE / "catalogue_txt.npy")
    meta = json.loads((CACHE / "catalogue_meta.json").read_text(encoding="utf-8"))

    dproc = Owlv2Processor.from_pretrained(DET_MODEL)
    det = Owlv2ForObjectDetection.from_pretrained(DET_MODEL).to(dev).eval()
    eproc = AutoProcessor.from_pretrained(EMB_MODEL)
    emb = AutoModel.from_pretrained(EMB_MODEL).to(dev).eval()

    (OUT / "annotated").mkdir(parents=True, exist_ok=True)
    with (OUT / "hf_detections.jsonl").open("w", encoding="utf-8") as f:
        for p in load_images(Path(args.images), args.limit):
            img = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
            img.thumbnail((1600, 1600))
            boxes, scores = detect(det, dproc, img, dev, args.det_thr, args.iou, args.min_frac)
            crops = []
            for x0, y0, x1, y1 in boxes:
                mx, my = 0.04 * (x1 - x0), 0.04 * (y1 - y0)
                crops.append(img.crop((max(0, x0 - mx), max(0, y0 - my), x1 + mx, y1 + my)))
            ce = embed_crops(emb, eproc, crops, dev)
            sims = ce @ cat_img.T if len(ce) else np.zeros((0, len(meta)))
            draw = ImageDraw.Draw(img)
            inst, agg = [], {}
            for b, s, row in zip(boxes, scores, sims, strict=True):
                top = np.argsort(-row)[:3]
                best = float(row[top[0]])
                matched = best >= args.match_thr
                cand = [{"code": meta[i]["code"], "name": meta[i]["product_name"], "brand": meta[i]["brands"],
                         "size": meta[i]["quantity"], "sim": round(float(row[i]), 3)} for i in top]  # fmt: skip
                inst.append({"box": [round(float(v)) for v in b], "det_score": round(float(s), 3),
                             "matched": matched, "candidates": cand})  # fmt: skip
                if matched:
                    agg[cand[0]["code"]] = agg.get(cand[0]["code"], 0) + 1
                color = "lime" if matched else "red"
                draw.rectangle([*map(float, b)], outline=color, width=3)
                draw.text((b[0] + 3, b[1] + 3), (cand[0]["name"][:18] if matched else "scan?"), fill=color)
            img.save(OUT / "annotated" / f"{p.stem}.jpg", quality=85)
            f.write(json.dumps({"image": p.name, "boxes": len(boxes), "matched": len(agg),
                                "counts": agg, "instances": inst}, ensure_ascii=False) + "\n")  # fmt: skip
            n_match = sum(i["matched"] for i in inst)
            print(f"{p.name}: {len(boxes)} boxes, {n_match} matched, {len(agg)} distinct products", flush=True)


if __name__ == "__main__":
    main()
