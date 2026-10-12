// Choose shelf photos. The camera and the gallery are separate inputs on purpose: on Android (the
// browser and the Capacitor WebView) an <input type="file"> with both `multiple` and `capture`
// ignores `capture` and only opens the gallery, so "take a photo" needs its own single-file input.
import { Camera, Images, X } from "lucide-react";

import { t, tf, useLocale } from "@/lib/i18n";

export const MAX_PHOTOS = 6;

export function PhotoPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const locale = useLocale();
  const add = (input: HTMLInputElement) => {
    const picked = Array.from(input.files ?? []);
    input.value = ""; // so the same photo can be picked again after removing it
    if (picked.length) onChange([...files, ...picked].slice(0, MAX_PHOTOS));
  };
  const full = files.length >= MAX_PHOTOS;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="list-surface flex cursor-pointer items-center gap-3 p-4" aria-disabled={full}>
          <Camera />
          <span className="text-sm">{t("Take a photo", locale)}</span>
          <input
            data-testid="camera-input"
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={full}
            onChange={(e) => add(e.target)}
          />
        </label>
        <label className="list-surface flex cursor-pointer items-center gap-3 p-4" aria-disabled={full}>
          <Images />
          <span className="text-sm">{t("Choose from gallery", locale)}</span>
          <input
            data-testid="gallery-input"
            className="sr-only"
            type="file"
            accept="image/*"
            multiple
            disabled={full}
            onChange={(e) => add(e.target)}
          />
        </label>
      </div>
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm">{tf(files.length === 1 ? "{n} photo selected" : "{n} photos selected", { n: files.length }, locale)}</p>
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  className="grid h-10 w-10 place-items-center"
                  aria-label={tf("Remove {name}", { name: f.name }, locale)}
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
