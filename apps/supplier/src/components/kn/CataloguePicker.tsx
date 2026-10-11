import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Package, Search } from "lucide-react";
import { searchCatalogue } from "@/lib/api/service";
import type { CatalogueChoice } from "@/lib/api/types";

export function CataloguePicker({ onPick }: { onPick: (c: CatalogueChoice) => void }) {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const results = useQuery({ queryKey: ["catalogue-search", term], queryFn: () => searchCatalogue(term), enabled: term.length >= 2 });

  return (
    <div className="space-y-3">
      <label className="flex min-h-12 items-center gap-2 rounded-full bg-card px-[18px]">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Search the product catalogue</span>
        <input
          autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by name"
          className="min-h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </label>
      {term.length < 2 ? (
        <p className="text-sm text-muted-foreground">Type at least 2 letters to find a product from the shared catalogue.</p>
      ) : results.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</p>
      ) : results.isError ? (
        <p className="text-sm font-medium text-destructive" role="alert">Couldn't search the catalogue. Try again.</p>
      ) : !results.data?.length ? (
        <p className="text-sm text-muted-foreground">No catalogue product matches “{term}”.</p>
      ) : (
        <div className="list-surface max-h-[40dvh] overflow-y-auto">
          {results.data.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c)} className="product-row w-full text-left hover:bg-secondary/50">
              <div className="product-art"><Package className="h-[21px] w-[21px]" aria-hidden /></div>
              <div className="min-w-0 flex-1">
                <div className="product-name truncate">{c.name}</div>
                <div className="product-sub">{c.category || "Uncategorised"} · {c.sku}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
