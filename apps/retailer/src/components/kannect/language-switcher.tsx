// Language menu for the header (and the login screen). Each language is named in its own script,
// so someone who cannot read the current language can still find theirs.
import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocale, t, useLocale, type Locale } from "@/lib/i18n";

const LANGUAGES: { code: Locale; name: string; short: string }[] = [
  { code: "en", name: "English", short: "EN" },
  { code: "ml", name: "മലയാളം", short: "മല" },
];

export function LanguageSwitcher() {
  const locale = useLocale();
  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-12 gap-1.5 rounded-full px-3" aria-label={t("Language", locale)}>
          <Languages size={19} aria-hidden />
          <span className="text-sm font-semibold">{current.short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="min-w-48 rounded-3xl border border-border bg-elevated p-1.5 shadow-[var(--shadow-soft)]"
      >
        <DropdownMenuRadioGroup value={locale} onValueChange={(code) => setLocale(code as Locale)}>
          {LANGUAGES.map((l) => (
            <DropdownMenuRadioItem
              key={l.code}
              value={l.code}
              className="min-h-12 cursor-pointer rounded-2xl py-2 pl-9 pr-4 text-base focus:bg-muted"
            >
              {l.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
