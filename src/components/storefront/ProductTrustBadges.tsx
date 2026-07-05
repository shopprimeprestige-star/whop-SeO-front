import { Truck, ShieldCheck, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/* ==============================================================
   ProductTrustBadges — Minimal premium (foto1 reference)
   3 elementi orizzontali su desktop, stack su mobile.
   Icone outline in cerchio grigio chiaro, testo bold + sub muted.
============================================================== */
export function ProductTrustBadges() {
  const { t } = useI18n();
  const BADGES = [
    { icon: Truck,       title: t("badge.shipping.title"), sub: t("badge.shipping.sub") },
    { icon: ShieldCheck, title: t("badge.warranty.title"), sub: t("badge.warranty.sub") },
    { icon: RotateCcw,   title: t("badge.return.title"),   sub: t("badge.return.sub") },
  ];
  return (
    <div className="flex flex-col gap-3.5 sm:gap-4">
      {BADGES.map((b) => (
        <div key={b.title} className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/70 ring-1 ring-border/60">
            <b.icon className="h-[20px] w-[20px] text-foreground" strokeWidth={1.6} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium tracking-[-0.005em] leading-tight text-foreground">
              {b.title}
            </div>
            <div className="mt-0.5 text-[13px] sm:text-[13.5px] text-muted-foreground leading-snug">
              {b.sub}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
