import { Info, Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";

/* ============== TRUSTPILOT GREEN STAR (square, white star) ============== */
function TpStar({ size = 20, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: filled ? "#00B67A" : "#dcdce6" }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.72} height={size * 0.72} fill="white">
        <path d="M12 2.5l2.95 6.36 6.55.6-4.95 4.55 1.5 6.49L12 17.27 5.95 20.5l1.5-6.49L2.5 9.46l6.55-.6L12 2.5z" />
      </svg>
    </span>
  );
}

function TpStars({ rating = 4.9, size = 20, gap = 2 }: { rating?: number; size?: number; gap?: number }) {
  return (
    <div className="inline-flex items-center" style={{ gap }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <TpStar key={i} size={size} filled={rating >= i + 0.5} />
      ))}
    </div>
  );
}

function TpLogoMark({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#00B67A" aria-hidden className="shrink-0">
      <path d="M12 2l2.95 6.36 6.55.6-4.95 4.55 1.5 6.49L12 17.27 5.95 20l1.5-6.49L2.5 8.96l6.55-.6L12 2z" />
    </svg>
  );
}

function TpLogoInline({ size = 13 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <TpLogoMark size={size} />
      <span className="font-semibold tracking-tight text-foreground" style={{ fontSize: size + 1 }}>
        Trustpilot
      </span>
    </span>
  );
}

/* ==============================================================
   TrustpilotBadge — Official Trustpilot widget style (foto2 ref)
   Layout 2 righe:
     riga 1:  Excellent  ★★★★★ (5 quadrati verdi)
     riga 2:  4.9 out of 5 based on 12.473+ reviews on [logo] Trustpilot
============================================================== */
export function TrustpilotBadge({
  rating = 4.9,
  reviews = 12473,
  description,
  variant = "default",
  align = "start",
  desktopBoost = false,
}: {
  rating?: number;
  reviews?: number;
  description?: string | null;
  compact?: boolean;
  /** "default" = 2 righe (PDP). "inline" = 1 riga compatta minimal (hero). */
  variant?: "default" | "inline";
  align?: "start" | "center";
  /** +30% font/icon size on desktop (lg). Used in hero. */
  desktopBoost?: boolean;
}) {
  const { t, lang } = useI18n();
  const reviewsLabel = reviews.toLocaleString(lang);
  const alignCls = align === "center" ? "items-center text-center" : "items-start";

  /* === INLINE / MINIMAL — usato in hero home page === */
  if (variant === "inline") {
    const textCls = desktopBoost
      ? "text-[12px] lg:text-[15.6px]"
      : "text-[12px]";
    const starSize = desktopBoost ? 12 : 12;
    const starSizeLg = desktopBoost ? 16 : 12;
    const logoSize = desktopBoost ? 10 : 10;
    const logoSizeLg = desktopBoost ? 13 : 10;
    return (
      <a
        href="https://www.trustpilot.com"
        target="_blank"
        rel="noopener nofollow"
        className={`inline-flex flex-wrap items-center justify-center gap-x-1.5 lg:gap-x-2 gap-y-0.5 ${textCls} text-foreground/80 leading-tight`}
      >
        <span className="inline-flex lg:hidden"><TpStars rating={5} size={starSize} gap={1.5} /></span>
        <span className="hidden lg:inline-flex"><TpStars rating={5} size={starSizeLg} gap={2} /></span>
        <span className="font-medium text-foreground">{t("trustpilot.excellent")}</span>
        <span className="text-foreground/35">·</span>
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">{rating.toFixed(1).replace(".", ",")}</span>
          <span className="text-foreground/55">/5</span>
        </span>
        <span className="text-foreground/35">·</span>
        <span className="tabular-nums text-foreground/65">{reviewsLabel}+ {t("trustpilot.reviews") || "reviews"}</span>
        <span className="inline-flex items-center gap-1 ml-0.5">
          <span className="inline-flex lg:hidden"><TpLogoMark size={logoSize} /></span>
          <span className="hidden lg:inline-flex"><TpLogoMark size={logoSizeLg} /></span>
          <span className="font-semibold text-foreground">Trustpilot</span>
        </span>
      </a>
    );
  }

  /* === DEFAULT — Compact pill: "Eccellente 4.9 ★★★★★ [logo] Trustpilot" === */
  const handleScrollToCarousel = (e: React.MouseEvent) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById("trustpilot-carousel");
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  return (
    <div className={`inline-flex flex-col gap-1.5 ${alignCls}`}>
      <a
        href="#trustpilot-carousel"
        onClick={handleScrollToCarousel}
        className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/60 px-3 py-1.5 hover:bg-foreground/[0.02] transition-colors cursor-pointer"
      >
        <span className="text-[12.5px] font-semibold tracking-tight text-foreground leading-none">
          {t("trustpilot.excellent")}
        </span>
        <span className="tabular-nums text-[12.5px] font-semibold text-foreground leading-none">
          {rating.toFixed(1).replace(".", ",")}
        </span>
        <TpStars rating={5} size={13} gap={1.5} />
        <span className="inline-flex items-center gap-1 leading-none pl-0.5 border-l border-foreground/10 ml-0.5">
          <TpLogoMark size={11} />
          <span className="text-[12px] font-semibold tracking-tight text-foreground">Trustpilot</span>
        </span>
      </a>
      {description && (
        <span className="text-[11.5px] leading-snug text-muted-foreground">{description}</span>
      )}
    </div>
  );
}

/* ==============================================================
   TrustpilotHeaderBadge — vertical, foto2 reference
============================================================== */
export function TrustpilotHeaderBadge({
  title,
  rating = 4.9,
  reviews = 12473,
}: {
  title?: string;
  rating?: number;
  reviews?: number;
}) {
  const { t, lang } = useI18n();
  const reviewsLabel = reviews.toLocaleString(lang);
  const storeTitle = title || t("trustpilot.store_title") || "Recensioni verificate";
  return (
    <div className="inline-flex flex-col items-center text-center gap-2.5">
      {/* H3 carousel: 22 / 26 / 30 — coerente con altre H2 ridotte */}
      <h3 className="text-[22px] sm:text-[26px] md:text-[30px] font-light tracking-[-0.025em] text-foreground leading-[1.1]">
        {storeTitle}
      </h3>
      <div className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12.5px] sm:text-[13px] text-foreground/80">
        <span>
          {t("trustpilot.reviews_label") || "Recensioni"}{" "}
          <span className="font-semibold text-foreground tabular-nums">{reviewsLabel}</span>
        </span>
        <span className="text-foreground/35">·</span>
        <span className="font-semibold text-foreground">{t("trustpilot.exceptional") || "Eccezionale"}</span>
      </div>
      <div className="inline-flex items-center gap-2">
        <TpStars rating={rating} size={22} />
        <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-foreground tabular-nums">
          {rating.toFixed(1).replace(".", ",")}
          <Info className="h-3.5 w-3.5 text-foreground/40" strokeWidth={1.6} />
        </span>
      </div>
      <a
        href="https://www.trustpilot.com"
        target="_blank"
        rel="noopener nofollow"
        className="inline-flex items-center gap-1.5 rounded-full bg-[#00B67A]/12 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#006B47]"
      >
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#00B67A] text-white">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
        {t("trustpilot.verified_company") || "Azienda verificata"}
      </a>
    </div>
  );
}

/* ============== CAROUSEL — drag + auto scroll ============== */
const REVIEW_KEYS = [
  { name: "Marco R.", rating: 5, dateKey: "tp.date.3d", textKey: "tp.review.1", count: 2 },
  { name: "Giulia T.", rating: 5, dateKey: "tp.date.1w", textKey: "tp.review.2", count: 4 },
  { name: "Andrea M.", rating: 5, dateKey: "tp.date.2w", textKey: "tp.review.3", count: 1 },
  { name: "Sara L.", rating: 4, dateKey: "tp.date.3w", textKey: "tp.review.4", count: 3 },
  { name: "Davide P.", rating: 5, dateKey: "tp.date.1m", textKey: "tp.review.5", count: 7 },
  { name: "Chiara N.", rating: 5, dateKey: "tp.date.1m", textKey: "tp.review.6", count: 2 },
];

function avatarColor(seed: string) {
  const palette = ["#0B5FFF", "#7B61FF", "#00B67A", "#F59E0B", "#EF4444", "#0EA5E9"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

export function TrustpilotCarousel() {
  const { t } = useI18n();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startScroll: number; moved: boolean }>({
    active: false, startX: 0, startScroll: 0, moved: false,
  });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    let paused = false;
    const speed = 0.4;
    const tick = () => {
      if (!paused && el) {
        el.scrollLeft += speed;
        const half = el.scrollWidth / 2;
        if (el.scrollLeft >= half) el.scrollLeft -= half;
      }
      raf = requestAnimationFrame(tick);
    };
    const onEnter = () => { paused = true; };
    const onLeave = () => { paused = false; };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("touchstart", onEnter, { passive: true });
    el.addEventListener("touchend", onLeave);
    el.addEventListener("pointerdown", onEnter);
    el.addEventListener("pointerup", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("touchstart", onEnter);
      el.removeEventListener("touchend", onLeave);
      el.removeEventListener("pointerdown", onEnter);
      el.removeEventListener("pointerup", onLeave);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = scrollerRef.current;
    const d = dragRef.current;
    if (!el || !d.active) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    el.scrollLeft = d.startScroll - dx;
  };
  const endDrag = () => { dragRef.current.active = false; };

  return (
    <section id="trustpilot-carousel" className="scroll-mt-24 pt-4 pb-3 sm:pt-4 sm:pb-3 -mx-4 md:-mx-6 px-4 md:px-6 bg-muted/20">
      <div className="text-center mb-6 sm:mb-8 flex flex-col items-center">
        <TrustpilotHeaderBadge />
      </div>

      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing select-none touch-pan-x"
        style={{ scrollBehavior: "auto" }}
      >
        <div className="flex gap-3 sm:gap-4 w-max pb-2">
          {[...REVIEW_KEYS, ...REVIEW_KEYS, ...REVIEW_KEYS].map((r, i) => {
            const initial = r.name.charAt(0);
            const color = avatarColor(r.name);
            return (
              <article
                key={i}
                className="shrink-0 w-[260px] sm:w-[300px] md:w-[330px] rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow"
                onClick={(e) => { if (dragRef.current.moved) e.preventDefault(); }}
              >
                {/* Header: "RECENSIONE SU [logo Trustpilot]" — 10px */}
                <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-2.5 font-medium">
                  <span>{t("trustpilot.review_for") || "Recensione su"}</span>
                  <span className="inline-flex items-center gap-1 normal-case tracking-normal">
                    <TpLogoMark size={11} />
                    <span className="text-foreground font-semibold">Trustpilot</span>
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-[13px] font-medium"
                    style={{ background: color }}
                  >
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-foreground truncate">{r.name}</div>
                    <div className="text-[10.5px] text-muted-foreground">
                      {r.count} {r.count === 1 ? (t("trustpilot.review_singular") || "recensione") : (t("trustpilot.review_plural") || "recensioni")}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <TpStars rating={r.rating} size={13} />
                  <span className="text-[10.5px] text-muted-foreground">
                    {t("trustpilot.updated") || "Aggiornata il"} {t(r.dateKey)}
                  </span>
                </div>

                <p className="mt-3 text-[12.5px] leading-relaxed text-foreground/85 line-clamp-6">
                  {t(r.textKey)}
                </p>

                <div className="mt-3 pt-3 border-t border-border/40 text-[10.5px] text-muted-foreground inline-flex items-center gap-1.5">
                  <Check className="h-3 w-3" style={{ color: "#00B67A" }} strokeWidth={2.5} />
                  {t("trustpilot.verified")}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
