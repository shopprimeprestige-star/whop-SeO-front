/**
 * Trasforma un URL Supabase Storage da `/object/public/` a `/render/image/public/`
 * con resize/quality, così serviamo immagini drasticamente più piccole.
 * Per URL non Supabase ritorna l'URL originale.
 */
export function optimizeImg(
  url: string | null | undefined,
  opts: { w?: number; h?: number; q?: number; fit?: "cover" | "contain" } = {},
): string {
  if (!url) return "";
  if (!/supabase\.co\/storage\/v1\/object\/public\//.test(url)) return url;
  const { w, h, q = 75, fit = "contain" } = opts;
  const transformed = url.replace("/object/public/", "/render/image/public/");
  const params = new URLSearchParams();
  if (w) params.set("width", String(w));
  if (h) params.set("height", String(h));
  params.set("quality", String(q));
  params.set("resize", fit);
  return `${transformed}?${params.toString()}`;
}
