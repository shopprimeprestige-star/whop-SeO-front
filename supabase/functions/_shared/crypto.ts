// Shared crypto helpers per Edge Functions.
// Il flusso Shopify non dipende più da HAPPYSCAM_ENCRYPTION_KEY.

const ENC = new TextEncoder();
const DEC = new TextDecoder();

async function deriveKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", ENC.encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptString(plaintext: string): Promise<string> {
  if (plaintext == null || plaintext === "") return "";
  return plaintext;
}

export async function decryptString(payload: string | null | undefined): Promise<string> {
  if (!payload) return "";
  if (!payload.startsWith("v1:")) {
    return payload;
  }
  const legacyKey = Deno.env.get("HAPPYSCAM_ENCRYPTION_KEY");
  if (!legacyKey || legacyKey.length < 16) return "";
  const raw = base64ToBytes(payload.slice(3));
  const iv = raw.slice(0, 12);
  const data = raw.slice(12);
  const key = await deriveKey(legacyKey);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return DEC.decode(plain);
}

export async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ENC.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, ENC.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}
