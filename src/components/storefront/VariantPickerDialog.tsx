import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export interface ProductVariantOption {
  label: string;
  displayLabel?: string;
  type?: "text" | "color" | "image";
  color?: string;
  image?: string;
  shopify_variant_id?: string | number;
  price?: number;
  available?: boolean;
}

interface PieceSelection {
  variant: ProductVariantOption | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: {
    slug: string;
    name: string;
    price: number;
    images: string[];
  };
  variants: ProductVariantOption[];
  /** Number of pieces to configure independently (e.g. bundle of 2). Default 1. */
  pieces: number;
  /** Called once user confirms a complete selection. */
  onConfirm: (selections: ProductVariantOption[]) => void;
}

/**
 * Apple-style variant picker.
 * - Renders N independent variant selectors (one per piece in the bundle).
 * - Selectors unlock progressively: piece N+1 only enabled after piece N is chosen.
 * - Smooth transitions, single-tap selection, no long copy.
 */
export function VariantPickerDialog({
  open,
  onOpenChange,
  product,
  variants,
  pieces,
  onConfirm,
}: Props) {
  const { t: tr } = useI18n();
  const totalPieces = Math.max(1, pieces);
  const [picks, setPicks] = useState<PieceSelection[]>(
    Array.from({ length: totalPieces }, () => ({ variant: null })),
  );

  // Reset selections each time the dialog opens or pieces count changes
  useEffect(() => {
    if (open) {
      setPicks(Array.from({ length: totalPieces }, () => ({ variant: null })));
    }
  }, [open, totalPieces]);

  const allDone = picks.every((p) => p.variant !== null);
  const heroImage = product.images[0];

  const variantTypeLabel = useMemo(() => {
    const t = variants[0]?.type ?? "text";
    if (t === "color") return "Colore";
    if (t === "image") return "Modello";
    return "Variante";
  }, [variants]);

  function pick(idx: number, v: ProductVariantOption) {
    setPicks((prev) => {
      const next = [...prev];
      next[idx] = { variant: v };
      return next;
    });
  }

  function confirm() {
    if (!allDone) return;
    onConfirm(picks.map((p) => p.variant!));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden border-border/40 bg-background/95 backdrop-blur-2xl">
        {/* Hero strip */}
        <div className="relative h-32 overflow-hidden bg-gradient-to-br from-muted via-muted/40 to-background">
          {heroImage && (
            <img
              src={heroImage}
              alt={product.name}
              className="absolute inset-0 h-full w-full object-cover opacity-40"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        <DialogHeader className="px-6 pt-2 pb-3">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {product.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {totalPieces > 1
              ? `Scegli ${variantTypeLabel.toLowerCase()} per ciascuno dei ${totalPieces} pezzi`
              : `Scegli ${variantTypeLabel.toLowerCase()}`}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5 max-h-[55vh] overflow-y-auto">
          {picks.map((p, idx) => {
            const previousDone = idx === 0 || picks[idx - 1].variant !== null;
            const locked = !previousDone;
            return (
              <div
                key={idx}
                className={cn(
                  "rounded-2xl border p-4 transition-all duration-300",
                  locked
                    ? "border-border/40 bg-muted/20 opacity-50"
                    : p.variant
                      ? "border-foreground/20 bg-foreground/[0.03]"
                      : "border-border bg-card",
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                        p.variant
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {p.variant ? <Check className="h-3 w-3" /> : idx + 1}
                    </div>
                    <span className="text-sm font-medium">
                      {totalPieces > 1 ? tr("qty.piece_n", { n: idx + 1 }) : variantTypeLabel}
                    </span>
                  </div>
                  {p.variant && (
                    <span className="text-xs text-muted-foreground">
                      {p.variant.displayLabel || p.variant.label}
                    </span>
                  )}
                </div>

                <div
                  className={cn(
                    "flex flex-wrap gap-2 transition-opacity",
                    locked && "pointer-events-none",
                  )}
                >
                  {variants.map((v) => {
                    const active = p.variant?.label === v.label;
                    const disabled = v.available === false;

                    if (v.type === "color") {
                      return (
                        <button
                          key={v.label}
                          onClick={() => !disabled && pick(idx, v)}
                          disabled={disabled || locked}
                          title={v.displayLabel || v.label}
                          className={cn(
                            "relative h-10 w-10 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all duration-200",
                            active
                              ? "ring-foreground scale-110"
                              : "ring-border hover:ring-foreground/40",
                            disabled && "opacity-30 cursor-not-allowed",
                          )}
                          style={{ backgroundColor: v.color || "#000" }}
                        >
                          {active && (
                            <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                          )}
                        </button>
                      );
                    }

                    if (v.type === "image" && v.image) {
                      return (
                        <button
                          key={v.label}
                          onClick={() => !disabled && pick(idx, v)}
                          disabled={disabled || locked}
                          className={cn(
                            "relative h-14 w-14 overflow-hidden rounded-xl ring-2 ring-offset-2 ring-offset-background transition-all duration-200",
                            active
                              ? "ring-foreground scale-105"
                              : "ring-border hover:ring-foreground/40",
                            disabled && "opacity-30 cursor-not-allowed",
                          )}
                        >
                          <img src={v.image} alt={v.displayLabel || v.label} className="h-full w-full object-cover" />
                        </button>
                      );
                    }

                    return (
                      <button
                        key={v.label}
                        onClick={() => !disabled && pick(idx, v)}
                        disabled={disabled || locked}
                        className={cn(
                          "px-4 py-2 rounded-full border text-sm font-medium transition-all duration-200",
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border hover:border-foreground/40",
                          disabled && "opacity-30 cursor-not-allowed line-through",
                        )}
                      >
                        {v.displayLabel || v.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border/60 bg-muted/20 px-6 py-4">
          <Button
            size="lg"
            className="w-full gap-2 rounded-full font-semibold"
            disabled={!allDone}
            onClick={confirm}
          >
            <ShoppingBag className="h-4 w-4" />
            {allDone
              ? `Aggiungi al carrello · € ${(product.price * totalPieces).toFixed(2)}`
              : `Seleziona ${picks.filter((p) => !p.variant).length} ${
                  picks.filter((p) => !p.variant).length === 1 ? "pezzo" : "pezzi"
                }`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
