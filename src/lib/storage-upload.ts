import { supabase } from "@/integrations/supabase/client";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/avif", "image/gif"];
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export type UploadResult = { url: string; path: string };

/**
 * Upload a logo / brand asset to the public `brand-assets` bucket.
 * Validates size & type client-side. Returns the public URL.
 */
export async function uploadBrandAsset(
  file: File,
  folder: "logo" | "payment" | "courier" | "cert" | "product" | "gallery" = "logo",
): Promise<UploadResult> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Formato non valido (${file.type}). Usa PNG, JPG, WebP o SVG.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File troppo grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 2 MB.`);
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 60);
  const path = `${folder}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from("brand-assets")
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("brand-assets").getPublicUrl(path);
  return { url: data.publicUrl, path };
}
