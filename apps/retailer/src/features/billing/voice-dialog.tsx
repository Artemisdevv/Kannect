import { Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, voiceBill } from "@/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatQty, priceLabel } from "@/lib/format";

type Result = Awaited<ReturnType<typeof voiceBill>>;
type Suggestion = NonNullable<Result["suggestions"]>[number];

export type VoiceLine = { productId: string; quantity: number };

/**
 * Say the bill ("ara kilo thakkali, randu Parle-G"), review what was heard, add it to the bill.
 * The model can miss an item, so the transcript is always shown next to the lines.
 */
export function VoiceDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (lines: VoiceLine[]) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "recording" | "working" | "review">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setSkip(new Set());
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setPhase("working");
        try {
          const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
          setResult(await voiceBill(blob));
          setPhase("review");
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : "Could not process the recording.");
          setPhase("idle");
        }
      };
      rec.start();
      recorder.current = rec;
      setPhase("recording");
    } catch {
      toast.error("Microphone not available. Allow microphone access and try again.");
    }
  };

  const suggestions = result?.suggestions ?? [];
  const usable = (s: Suggestion) => Boolean(s.product?.id) && (s.quantity ?? 0) > 0;

  const add = () => {
    const lines = suggestions
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => usable(s) && !skip.has(i))
      .map(({ s }) => ({ productId: s.product!.id as string, quantity: s.quantity as number }));
    if (lines.length === 0) {
      toast.error("Nothing to add yet.");
      return;
    }
    onAdd(lines);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && recorder.current?.state === "recording") recorder.current.stop();
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="mobile-dialog">
        <DialogTitle>Speak the bill</DialogTitle>
        <DialogDescription>
          Say each item with its quantity, in Malayalam or English. Example: "ara kilo thakkali,
          randu Parle-G".
        </DialogDescription>

        {phase === "idle" && (
          <Button className="w-full h-14" onClick={() => void start()}>
            <Mic /> Start speaking
          </Button>
        )}
        {phase === "recording" && (
          <Button className="w-full h-14" variant="destructive" onClick={() => recorder.current?.stop()}>
            <Square /> Stop and read
          </Button>
        )}
        {phase === "working" && <p className="text-sm text-muted-foreground">Listening to the recording…</p>}

        {phase === "review" && (
          <div className="space-y-3">
            {result?.transcript && (
              <p className="text-sm rounded-2xl bg-secondary p-3">
                <span className="text-xs text-muted-foreground block">I heard</span>
                {result.transcript}
              </p>
            )}
            {suggestions.length === 0 && (
              <p className="text-sm text-muted-foreground">No items were found. Try again, speaking closer to the phone.</p>
            )}
            <div className="list-surface">
              {suggestions.map((s, i) => (
                <div key={i} className="product-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <div className="min-w-0">
                    <div className="product-name">{s.product?.name ?? s.name ?? s.spoken}</div>
                    <div className="product-sub">
                      {usable(s)
                        ? `${formatQty(s.quantity, s.unit)} · ${priceLabel(s.price ?? undefined, s.unit)}`
                        : (s.note ?? "Not found in your shop's products")}
                    </div>
                    {usable(s) && s.note && <div className="product-sub text-warning">{s.note}</div>}
                  </div>
                  {usable(s) && (
                    <Button
                      variant={skip.has(i) ? "ghost" : "secondary"}
                      size="sm"
                      onClick={() => {
                        const next = new Set(skip);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        setSkip(next);
                      }}
                    >
                      {skip.has(i) ? "Skipped" : "Add"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Check the list against what was said. Anything missing, add by search or scan.
            </p>
            <Button className="w-full" onClick={add}>
              Add to bill
            </Button>
            <Button variant="ghost" className="w-full" onClick={reset}>
              Record again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
