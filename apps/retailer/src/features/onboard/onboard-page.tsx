import { useNavigate } from "@tanstack/react-router";
import { Camera, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, createProduct, shelfPhoto } from "@/api";
import { PhotoPicker } from "./photo-picker";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { useAddProductsBulk, useRecount } from "@/features/queries";
import { formatQty, newId } from "@/lib/format";
import { t, tf, useLocale, type Locale } from "@/lib/i18n";
import { tidy } from "@/lib/validation";

type Result = Awaited<ReturnType<typeof shelfPhoto>>;
type Detection = NonNullable<Result["detections"]>[number];
type Level = "plenty" | "some" | "few" | "none";
type Unit = "piece" | "gram";

type Option = { id: string; label: string; unit: Unit };

type Row = {
  key: string;
  seen: string; // what the model read, shown as a caption
  loose: boolean;
  include: boolean;
  count: string; // what the owner confirms: pieces, or kilograms for loose goods
  aiCount: string; // what the photo reader counted (shown so the owner can see the difference)
  price: string;
  priceHint: string;
  options: Option[]; // catalogue products it might be
  pick: number; // index into options, or -1 for "something else: add as a new product"
  draft: { name: string; brand: string; size: string }; // used when pick is -1
  inShop: boolean;
  currentQty: number | null;
  currentStatus: string | null;
};

// Loose goods are weighed, not counted: start from a typical amount and let the owner weigh it.
const LOOSE_KG: Record<Level, number> = { plenty: 5, some: 2, few: 0.5, none: 0 };

const isGram = (r: Row) => r.loose || r.options[r.pick]?.unit === "gram";
const baseQty = (r: Row) => Math.max(0, Math.round(Number(r.count) * (isGram(r) ? 1000 : 1)) || 0);
const step = (r: Row) => (isGram(r) ? 0.25 : 1);

const optionOf = (p: { id?: string; name?: string; brand?: string | null; size?: string | null; unit?: string }) => ({
  id: p.id as string,
  label: [p.brand, p.name, p.size].filter(Boolean).join(" "),
  unit: (p.unit === "gram" ? "gram" : "piece") as Unit,
});

/** One row per thing the model read. Unreadable guesses with no brand are dropped (counted instead). */
function toRow(d: Detection, i: number): Row | null {
  const read = d.read ?? {};
  const name = tidy(read.name ?? "");
  const brand = tidy(read.brand ?? "");
  if (!d.match && d.readable === false && !brand) return null;
  if (!d.match && !(d.alternatives?.length) && !name && !brand) return null;

  const options = (d.match ? [d.match, ...(d.alternatives ?? [])] : (d.alternatives ?? [])).map(optionOf);
  const level = (d.suggested_level as Level | undefined) ?? "some";
  const loose = Boolean(d.loose);
  const aiCount = loose ? String(LOOSE_KG[level]) : String(Math.max(0, d.visible_count ?? 1));
  return {
    key: `${i}`,
    seen: d.label ?? [brand, name].filter(Boolean).join(" "),
    loose: Boolean(d.loose),
    // Recounting something the shop already has replaces a number it may know better, so that is opt-in.
    include: d.readable !== false && !d.uncertain && !d.in_shop,
    count: aiCount,
    aiCount,
    price: d.suggested_price != null ? String(d.suggested_price) : "",
    priceHint:
      d.price_source === "mrp" ? "printed price" : d.price_source === "nearby_median" ? "typical nearby" : "",
    options,
    pick: options.length ? 0 : -1,
    draft: { name: name || tidy(d.label ?? ""), brand, size: tidy(read.size ?? "") },
    inShop: Boolean(d.in_shop),
    currentQty: d.current_quantity ?? null,
    currentStatus: d.current_status ?? null,
  };
}

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function qualityMessage(quality: string, locale: Locale) {
  switch (quality) {
    case "blurry": return t("The photo looks blurry. Retake it for better results.", locale);
    case "too_dark": return t("The photo looks too dark. Retake it for better results.", locale);
    case "too_far": return t("The photo looks too far away. Retake it for better results.", locale);
    default: return t("The photo is not clear enough. Retake it for better results.", locale);
  }
}

export function OnboardPage() {
  const locale = useLocale();
  const navigate = useNavigate();
  const addBulk = useAddProductsBulk();
  const recount = useRecount();
  const [files, setFiles] = useState<File[]>([]);
  const [thorough, setThorough] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dropped, setDropped] = useState(0);

  const read = async () => {
    setBusy(true);
    try {
      const res = await shelfPhoto(files, thorough);
      const detections = res.detections ?? [];
      const next = detections.map(toRow).filter((r): r is Row => r !== null);
      setRows(next);
      setDropped(detections.length - next.length);
      if (res.image_quality && res.image_quality !== "good") {
        toast.warning(qualityMessage(res.image_quality, locale));
      }
    } catch (e) {
      toast.error(errorText(e, t("Could not read the photo.", locale)));
    } finally {
      setBusy(false);
    }
  };

  const patch = (key: string, p: Partial<Row>) =>
    setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...p } : r)) ?? null);
  const patchDraft = (key: string, p: Partial<Row["draft"]>) =>
    setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, draft: { ...r.draft, ...p } } : r)) ?? null);

  const chosen = (rows ?? []).filter((r) => r.include);

  const save = async () => {
    if (!rows) return;
    const problems = chosen.filter(
      (r) => (r.pick === -1 && tidy(r.draft.name).length < 2) || (!r.inShop && !(Number(r.price) > 0)),
    );
    if (problems.length) {
      toast.error(t("Each ticked item needs a name and a price. Untick the ones you don't want.", locale));
      return;
    }
    setSaving(true);
    try {
      // 1. Items the catalogue did not have become new shared products, once the owner has confirmed.
      const resolved: { row: Row; productId: string }[] = [];
      let reused = 0;
      for (const row of chosen) {
        if (row.pick >= 0) {
          resolved.push({ row, productId: row.options[row.pick]!.id });
          continue;
        }
        const made = await createProduct({
          name: tidy(row.draft.name),
          unit: row.loose ? "gram" : "piece",
          ...(tidy(row.draft.brand) ? { brand: tidy(row.draft.brand) } : {}),
          ...(tidy(row.draft.size) ? { size: tidy(row.draft.size) } : {}),
        });
        // A near-identical product already exists: use it instead of creating a duplicate.
        if (made.created) resolved.push({ row, productId: made.product.id as string });
        else if (made.similar[0]) {
          reused++;
          resolved.push({ row, productId: made.similar[0].id as string });
        }
      }

      // 2. One entry per product, then save: new to this shop -> add, already stocked -> recount.
      const unique = new Map<string, Row>();
      resolved.forEach(({ row, productId }) => unique.has(productId) || unique.set(productId, row));
      const entries = [...unique.entries()];
      const fresh = entries.filter(([, r]) => !r.inShop);
      const existing = entries.filter(([, r]) => r.inShop);

      if (fresh.length) {
        await addBulk.mutateAsync({
          items: fresh.map(([productId, r]) => ({
            product_id: productId,
            price: Number(r.price) > 0 ? Number(r.price) : 1,
            opening_stock: baseQty(r),
            count_source: "photo_estimate" as const,
          })),
        });
      }
      if (existing.length) {
        await recount.mutateAsync({
          items: existing.map(([productId, r]) => ({
            client_id: newId(),
            product_id: productId,
            quantity: baseQty(r),
            count_source: "photo_estimate" as const,
          })),
        });
      }
      toast.success(
        tf(entries.length === 1 ? "Saved {n} product" : "Saved {n} products", { n: entries.length }, locale) +
          (reused ? ` ${tf("({n} matched existing products)", { n: reused }, locale)}` : ""),
      );
      await navigate({ to: "/stock" });
    } catch (e) {
      toast.error(errorText(e, t("Could not save. Nothing was lost, try again.", locale)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell active="More">
      <p className="eyebrow">{t("Set up from a photo", locale)}</p>
      <h1>{t("Shelf photo", locale)}</h1>

      {!rows && (
        <div className="space-y-4 mt-3">
          <p className="text-sm text-muted-foreground">
            {t("Take clear photos of your shelves, up to 6, with the camera or from your gallery. We guess what each product is, and you confirm before anything is saved.", locale)}
          </p>
          <PhotoPicker files={files} onChange={setFiles} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={thorough} onChange={(e) => setThorough(e.target.checked)} />
            {t("Look closely for small labels (slower: about 30 seconds a photo)", locale)}
          </label>
          <Button className="w-full" disabled={busy || files.length === 0} onClick={() => void read()}>
            {busy ? t("Reading your shelves… please wait", locale) : t("Read photos", locale)}
          </Button>
        </div>
      )}

      {rows && (
        <div className="space-y-3 mt-3">
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? t("We couldn't read any products. Try a closer, brighter photo.", locale)
              : tf(rows.length === 1 ? "We found {n} item. Untick anything wrong, correct the names and add prices." : "We found {n} items. Untick anything wrong, correct the names and add prices.", { n: rows.length }, locale)}
          </p>
          <div className="list-surface">
            {rows.map((r) => (
              <div key={r.key} className="p-4 border-b last:border-0 space-y-2">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1" checked={r.include} onChange={(e) => patch(r.key, { include: e.target.checked })} />
                  <span className="min-w-0">
                    <span className="product-name block">
                      {r.pick >= 0 ? r.options[r.pick]?.label : tidy(`${r.draft.brand} ${r.draft.name} ${r.draft.size}`)}
                    </span>
                    <span className="product-sub block">
                      {r.pick >= 0 && r.options.length > 0 && r.seen !== r.options[r.pick]?.label ? tf("Read as: {seen}", { seen: r.seen }, locale) : r.pick === -1 ? t("New to our catalogue: you can correct it below", locale) : ""}
                    </span>
                    {r.inShop && (
                      <span className="product-sub block">
                        {tf("In your shop now: {qty}. Tick to replace it with the count below.", { qty: formatQty(r.currentQty, r.options[0]?.unit, locale) }, locale)}
                      </span>
                    )}
                  </span>
                </label>

                {r.include && (
                  <div className="space-y-2 pl-7">
                    {r.options.length > 0 && (
                      <div className="space-y-1">
                        {r.options.length > 1 || r.pick === -1 ? (
                          <p className="text-xs text-muted-foreground">{t("Which one is it?", locale)}</p>
                        ) : null}
                        {(r.options.length > 1 || r.pick === -1 ? r.options : []).map((o, idx) => (
                          <label key={o.id} className="flex items-center gap-2 text-sm">
                            <input type="radio" name={`pick-${r.key}`} checked={r.pick === idx} onChange={() => patch(r.key, { pick: idx })} />
                            {o.label}
                          </label>
                        ))}
                        {(r.options.length > 1 || r.pick === -1) && (
                          <label className="flex items-center gap-2 text-sm">
                            <input type="radio" name={`pick-${r.key}`} checked={r.pick === -1} onChange={() => patch(r.key, { pick: -1 })} />
                            {t("None of these, add as a new product", locale)}
                          </label>
                        )}
                        {r.options.length === 1 && r.pick === 0 && (
                          <Button size="sm" variant="ghost" className="px-0 h-auto text-xs" onClick={() => patch(r.key, { pick: -1 })}>
                            {t("Not right? Add as a different product", locale)}
                          </Button>
                        )}
                      </div>
                    )}

                    {r.pick === -1 && (
                      <div className="space-y-2">
                        <input className="page-search" aria-label={t("Product name", locale)} placeholder={t("Product name", locale)} maxLength={255} value={r.draft.name} onChange={(e) => patchDraft(r.key, { name: e.target.value })} />
                        <div className="flex gap-2">
                          <input className="page-search min-w-0" aria-label={t("Brand", locale)} placeholder={t("Brand", locale)} maxLength={100} value={r.draft.brand} onChange={(e) => patchDraft(r.key, { brand: e.target.value })} />
                          <input className="page-search min-w-0" aria-label={t("Size", locale)} placeholder={t("Size", locale)} maxLength={40} value={r.draft.size} onChange={(e) => patchDraft(r.key, { size: e.target.value })} />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="quantity-controls" aria-label={tf("Count for {name}", { name: r.seen }, locale)}>
                        <Button variant="outline" size="icon" aria-label={t("Decrease", locale)} onClick={() => patch(r.key, { count: String(Math.max(0, (Number(r.count) || 0) - step(r))) })}>
                          <Minus />
                        </Button>
                        <input
                          className="page-search w-20 text-center"
                          aria-label={t("How many", locale)}
                          inputMode="decimal"
                          value={r.count}
                          onChange={(e) => patch(r.key, { count: e.target.value.replace(/[^\d.]/g, "") })}
                        />
                        <Button variant="outline" size="icon" aria-label={t("Increase", locale)} onClick={() => patch(r.key, { count: String((Number(r.count) || 0) + step(r)) })}>
                          <Plus />
                        </Button>
                        <span className="text-xs text-muted-foreground">{t(isGram(r) ? "kg" : "pcs", locale)}</span>
                      </div>
                      {!r.inShop && (
                        <input
                          className="page-search max-w-40"
                          aria-label={tf("Price for {name}", { name: r.seen }, locale)}
                          inputMode="decimal"
                          placeholder={t(r.loose || r.options[r.pick]?.unit === "gram" ? "₹ per kg" : "₹ price", locale)}
                          value={r.price}
                          onChange={(e) => patch(r.key, { price: e.target.value })}
                        />
                      )}
                      {!r.inShop && r.priceHint && <span className="text-xs text-muted-foreground">{t(r.priceHint, locale)}</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {dropped > 0 && (
            <p className="text-xs text-muted-foreground">
              {tf(dropped === 1 ? "{n} blurry or unclear item was left out. Add those by scanning their barcode in Billing or Stock." : "{n} blurry or unclear items were left out. Add those by scanning their barcode in Billing or Stock.", { n: dropped }, locale)}
            </p>
          )}
          <Button className="w-full" disabled={saving || chosen.length === 0} onClick={() => void save()}>
            {saving ? t("Saving…", locale) : tf("Save {n} to my shop", { n: chosen.length }, locale)}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setRows(null)}>
            {t("Start over", locale)}
          </Button>
        </div>
      )}
    </Shell>
  );
}
