/**
 * SmartImage — ottimizza immagini su Supabase Storage con:
 * - srcset multi-density (WebP)
 * - fallback nativo per URL esterni
 * - lazy/eager configurabile
 *
 * Supabase Storage supporta query params di trasformazione:
 *   ?width=N&quality=Q&format=webp (resize=contain by default)
 */

type Fit = "cover" | "contain";

interface Props {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes?: string;
  /** Densità/larghezze da generare (px). */
  widths?: number[];
  className?: string;
  eager?: boolean;
  priority?: boolean;
  fit?: Fit;
  quality?: number;
}

function isSupabaseStorage(url: string): boolean {
  return /supabase\.co\/storage\/v1\/object\/public\//.test(url);
}

/** Trasforma URL Supabase Storage da `/object/public/` a `/render/image/public/` con params. */
function buildSupabaseUrl(url: string, w: number, q: number, fit: Fit): string {
  const transformed = url.replace("/object/public/", "/render/image/public/");
  const params = new URLSearchParams({
    width: String(w),
    quality: String(q),
    resize: fit,
    // 'origin' lascia che Supabase serva WebP/AVIF in base all'header Accept del browser
    format: "origin",
  });
  return `${transformed}?${params.toString()}`;
}

export function SmartImage({
  src,
  alt,
  width,
  height,
  sizes,
  widths = [400, 600, 800, 1200, 1600],
  className,
  eager,
  priority,
  fit = "contain",
  quality = 75,
}: Props) {
  const supported = isSupabaseStorage(src);

  const srcSet = supported
    ? widths.map((w) => `${buildSupabaseUrl(src, w, quality, fit)} ${w}w`).join(", ")
    : undefined;

  const fallbackSrc = supported ? buildSupabaseUrl(src, Math.min(width, 1200), quality, fit) : src;

  return (
    <img
      src={fallbackSrc}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      width={width}
      height={height}
      loading={eager || priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={className}
    />
  );
}
