import { useI18n } from "@/lib/i18n";
import { useFooterConfig } from "@/hooks/useSiteCMS";
import { optimizeImg } from "@/lib/imgUrl";

type Courier = { name: string; src: string };

/* ============== Premium minimal "Shipped with"
   - Loghi reali B/N ad alto contrasto (filtrati grayscale)
   - Dimensione configurabile da admin (mobile +35% rispetto desktop)
============== */

const DEFAULT_COURIERS: Courier[] = [
  { name: "DHL",   src: "https://upload.wikimedia.org/wikipedia/commons/a/ac/DHL_Logo.svg" },
  { name: "UPS",   src: "https://upload.wikimedia.org/wikipedia/commons/6/6c/United_Parcel_Service_logo_2014.svg" },
  { name: "FedEx", src: "https://upload.wikimedia.org/wikipedia/commons/b/b9/FedEx_Corporation_-_2016_Logo.svg" },
  { name: "GLS",   src: "https://upload.wikimedia.org/wikipedia/commons/0/03/Logo_gls.svg" },
];

export function CourierBanner({
  couriers,
}: {
  couriers?: Courier[];
  variant?: "light" | "dark";
}) {
  const { t } = useI18n();
  const footer = useFooterConfig() as any;
  const items = couriers && couriers.length > 0 ? couriers : DEFAULT_COURIERS;

  const heightDesktopBase = Math.max(12, Math.min(64, Number(footer?.courier_logo_height_desktop ?? 24)));
  // Desktop & tablet: +35% rispetto alla base
  const heightDesktop = Math.round(heightDesktopBase * 1.35);
  const heightMobile = Math.max(12, Math.min(96, Number(footer?.courier_logo_height_mobile ?? heightDesktopBase)));

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 border-y border-slate-200/70 dark:border-white/10">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-12">
          <span className="text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
            {t("courier.shipped_with")}
          </span>
          <div className="flex flex-nowrap items-center justify-center gap-x-7 sm:gap-x-12">
            {items.map((c) => (
              <div
                key={c.name}
                title={c.name}
                className="flex items-center justify-center"
              >
                <img
                  src={optimizeImg(c.src, { h: heightDesktop * 2, q: 80 })}
                  alt={c.name}
                  loading="lazy"
                  decoding="async"
                  width={Math.round(heightDesktop * 2.5)}
                  height={heightDesktop}
                  className="block w-auto max-w-full object-contain courier-logo-img"
                  style={{
                    // height set via CSS variable so we can swap mobile/desktop with @media
                    ["--cl-h-mobile" as any]: `${heightMobile}px`,
                    ["--cl-h-desktop" as any]: `${heightDesktop}px`,
                    height: "var(--cl-h-mobile)",
                    filter: "grayscale(100%) contrast(1.25) brightness(0.7)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @media (min-width: 640px) {
          .courier-logo-img { height: var(--cl-h-desktop) !important; }
        }
      `}</style>
    </div>
  );
}
