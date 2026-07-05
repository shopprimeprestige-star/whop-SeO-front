import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { __DICT__ } from "@/lib/i18n";

/** Client Supabase server-side che usa publishable key (no service role).
 *  Fallback usato quando SUPABASE_SERVICE_ROLE_KEY non è iniettata nel worker. */
function getServerSupabase(accessToken?: string) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "";
  if (!url || !key) {
    throw new Error("Supabase non configurato sul server.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

const TARGET_LANGS = [
  "en", "de", "fr", "es", "pt", "nl",
  "bg", "cs", "da", "el", "et", "fi", "ga", "hr", "hu",
  "lt", "lv", "mt", "pl", "ro", "sk", "sl", "sv",
  "no", "is", "ja", "ko", "zh", "ar", "he",
] as const;
type TargetLang = (typeof TARGET_LANGS)[number];

const LANG_NAMES: Record<TargetLang, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  nl: "Dutch",
  bg: "Bulgarian",
  cs: "Czech",
  da: "Danish",
  el: "Greek",
  et: "Estonian",
  fi: "Finnish",
  ga: "Irish",
  hr: "Croatian",
  hu: "Hungarian",
  lt: "Lithuanian",
  lv: "Latvian",
  mt: "Maltese",
  pl: "Polish",
  ro: "Romanian",
  sk: "Slovak",
  sl: "Slovenian",
  sv: "Swedish",
  no: "Norwegian (Bokmål)",
  is: "Icelandic",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Traditional)",
  ar: "Arabic",
  he: "Hebrew",
};

const TRACKED_TYPES = ["product", "category", "legal_page", "footer", "branding", "ui"];
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 25_000;
const AI_TIMEOUT_MS = 30_000;
const MAX_BATCH_ATTEMPTS = 2;
const MAX_SINGLE_ATTEMPTS = 2;

export type AiProvider = "gemini" | "lovable" | "openrouter";
export interface AiConfig {
  provider: AiProvider;
  model: string;
  apiKey?: string;
  source: "settings" | "secret" | "default";
}

const DEFAULT_AI_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.5-flash",
  lovable: "google/gemini-2.5-flash",
  openrouter: "openai/gpt-4o-mini",
};

interface TranslateDebugContext {
  batchId: string;
  batchIndex: number;
  totalBatches: number;
  attempt: number;
  mode: "batch" | "single";
}

function isNonRetryableAiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /\b(400|401|403|404)\b/.test(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isHtmlTranslationField(key: string): boolean {
  const field = parseCompositeKey(key)?.field || "";
  return field === "description_html" || field === "shipping_returns_html";
}

function splitTranslatableText(text: string, maxChars = 1600): string[] {
  if (text.length <= maxChars) return [text];
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    const windowText = rest.slice(0, maxChars);
    const cut = Math.max(windowText.lastIndexOf(". "), windowText.lastIndexOf("! "), windowText.lastIndexOf("? "), windowText.lastIndexOf("; "), windowText.lastIndexOf(", "));
    const at = cut > maxChars * 0.45 ? cut + 1 : maxChars;
    pieces.push(rest.slice(0, at));
    rest = rest.slice(at);
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function splitHtmlForTranslation(html: string): { template: string; parts: Array<{ placeholder: string; text: string; leading: string; trailing: string }> } {
  const tokens = html.split(/(<[^>]*>)/g);
  const parts: Array<{ placeholder: string; text: string; leading: string; trailing: string }> = [];
  let template = "";
  let skipTag: "script" | "style" | null = null;
  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith("<") && token.endsWith(">")) {
      const closing = token.match(/^<\s*\/\s*(script|style)\s*>/i)?.[1]?.toLowerCase() as "script" | "style" | undefined;
      const opening = token.match(/^<\s*(script|style)\b/i)?.[1]?.toLowerCase() as "script" | "style" | undefined;
      if (closing && skipTag === closing) skipTag = null;
      template += token;
      if (opening) skipTag = opening;
      continue;
    }
    if (skipTag || !/[\p{L}\p{N}]/u.test(token.trim())) {
      template += token;
      continue;
    }
    const leading = token.match(/^\s*/)?.[0] || "";
    const trailing = token.match(/\s*$/)?.[0] || "";
    const text = token.slice(leading.length, token.length - trailing.length);
    if (!text.trim()) {
      template += token;
      continue;
    }
    const textPieces = splitTranslatableText(text);
    template += leading;
    textPieces.forEach((piece) => {
      const placeholder = `__HTML_TX_${parts.length}__`;
      parts.push({ placeholder, text: piece, leading: "", trailing: "" });
      template += placeholder;
    });
    template += trailing;
  }
  return { template, parts };
}

async function logGeminiDebug(args: {
  level: "info" | "success" | "warning" | "error";
  lang: TargetLang;
  message: string;
  metadata: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("system_logs").insert([{
      level: args.level,
      category: "gemini",
      message: args.message.slice(0, 4000),
      metadata: args.metadata,
    } as any]);
  } catch (e) {
    console.warn("[translate][gemini-log] insert failed", e);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function resolveGeminiKey(): Promise<{ key?: string; source: "crm" | "secret" | "none" }> {
  let key = process.env.GEMINI_API_KEY?.trim() || process.env.gemini?.trim() || undefined;
  let source: "crm" | "secret" | "none" = key ? "secret" : "none";
  try {
    const sb: any = (() => {
      try { return supabaseAdmin; } catch { return getServerSupabase(); }
    })();
    const { data: row } = await sb
      .from("settings")
      .select("value")
      .eq("key", "gemini_api_key")
      .maybeSingle();
    const dbKey = typeof row?.value === "string" ? row.value : (row?.value as any)?.key;
    if (dbKey && typeof dbKey === "string" && dbKey.trim().length > 10) {
      key = dbKey.trim();
      source = "crm";
    }
  } catch (e) {
    console.warn("[translate] impossibile leggere gemini_api_key dal DB", e);
  }
  return { key, source };
}

async function readSettingString(key: string): Promise<string | undefined> {
  try {
    const sb: any = (() => { try { return supabaseAdmin; } catch { return getServerSupabase(); } })();
    const { data: row } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
    const v = typeof row?.value === "string" ? row.value : (row?.value as any)?.key;
    if (v && typeof v === "string" && v.trim().length > 10) return v.trim();
  } catch (e) {
    console.warn(`[translate] read setting ${key} failed`, e);
  }
  return undefined;
}

export async function resolveAiConfig(): Promise<AiConfig> {
  let provider: AiProvider = "gemini";
  let model: string = DEFAULT_AI_MODELS.gemini;
  let configFound = false;
  try {
    const sb: any = (() => { try { return supabaseAdmin; } catch { return getServerSupabase(); } })();
    const { data: row } = await sb.from("settings").select("value").eq("key", "ai_config").maybeSingle();
    const v: any = row?.value;
    if (v && typeof v === "object") {
      configFound = true;
      if (v.provider === "lovable" || v.provider === "openrouter" || v.provider === "gemini") provider = v.provider;
      if (typeof v.model === "string" && v.model.trim()) model = v.model.trim();
      else model = DEFAULT_AI_MODELS[provider];
    }
  } catch (e) {
    console.warn("[translate] cannot read ai_config", e);
  }
  let apiKey: string | undefined;
  if (provider === "gemini") {
    apiKey = (await resolveGeminiKey()).key;
  } else if (provider === "lovable") {
    apiKey = process.env.LOVABLE_API_KEY?.trim();
  } else if (provider === "openrouter") {
    apiKey = await readSettingString("openrouter_api_key");
    if (!apiKey) apiKey = process.env.OPENROUTER_API_KEY?.trim();
  }
  return { provider, model, apiKey, source: configFound ? "settings" : "default" };
}

async function callAiCompletion(args: {
  cfg: AiConfig;
  systemPrompt: string;
  userPrompt: string;
  lang: TargetLang;
  debugBase: Record<string, unknown>;
}): Promise<{ content: string; finishReason: string; raw: any }> {
  const { cfg, systemPrompt, userPrompt, lang, debugBase } = args;
  const startedAt = Date.now();

  if (cfg.provider === "gemini") {
    if (!cfg.apiKey) throw new Error("Gemini API key mancante: configurala in Impostazioni → AI.");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 16384 },
    };
    const resp = await fetchWithTimeout(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, GEMINI_TIMEOUT_MS);
    if (!resp.ok) {
      const txt = await resp.text();
      await logGeminiDebug({ level: "error", lang, message: `Gemini HTTP ${resp.status} ${lang}`, metadata: { ...debugBase, provider: cfg.provider, model: cfg.model, durationMs: Date.now() - startedAt, status: resp.status, response: txt } });
      throw new Error(`Gemini ${resp.status} (${lang}): ${txt.slice(0, 240)}`);
    }
    const json = await resp.json();
    const finishReason = json?.candidates?.[0]?.finishReason || "UNKNOWN";
    const content = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    await logGeminiDebug({ level: content ? "success" : "warning", lang, message: `Gemini response ${lang} finish=${finishReason}`, metadata: { ...debugBase, provider: cfg.provider, model: cfg.model, durationMs: Date.now() - startedAt, finishReason, usageMetadata: json?.usageMetadata || {} } });
    return { content, finishReason, raw: json };
  }

  // OpenAI-compatible (Lovable AI Gateway / OpenRouter)
  const endpoint = cfg.provider === "lovable"
    ? "https://ai.gateway.lovable.dev/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  if (!cfg.apiKey) {
    if (cfg.provider === "lovable") throw new Error("LOVABLE_API_KEY non disponibile sul server.");
    throw new Error("OpenRouter API key mancante: configurala in Impostazioni → AI.");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (cfg.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.SUPABASE_URL || "https://lovable.dev";
    headers["X-Title"] = "CRM Translations";
  }
  const body: any = {
    model: cfg.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
  };
  // Many models on these gateways support response_format json_object; ignored if not.
  body.response_format = { type: "json_object" };

  const resp = await fetchWithTimeout(endpoint, { method: "POST", headers, body: JSON.stringify(body) }, AI_TIMEOUT_MS);
  if (!resp.ok) {
    const txt = await resp.text();
    await logGeminiDebug({ level: "error", lang, message: `${cfg.provider} HTTP ${resp.status} ${lang}`, metadata: { ...debugBase, provider: cfg.provider, model: cfg.model, durationMs: Date.now() - startedAt, status: resp.status, response: txt.slice(0, 2000) } });
    let hint = "";
    if (resp.status === 429) hint = " — limite di richieste raggiunto, riprova tra poco o cambia provider/modello.";
    else if (resp.status === 402) hint = " — credito insufficiente per il provider AI selezionato.";
    else if (resp.status === 401 || resp.status === 403) hint = " — API key non valida o senza permessi per questo modello.";
    throw new Error(`${cfg.provider} ${resp.status} (${lang}): ${txt.slice(0, 200)}${hint}`);
  }
  const json = await resp.json();
  const finishReason = json?.choices?.[0]?.finish_reason || "stop";
  const content = json?.choices?.[0]?.message?.content || "";
  await logGeminiDebug({ level: content ? "success" : "warning", lang, message: `${cfg.provider} response ${lang} finish=${finishReason}`, metadata: { ...debugBase, provider: cfg.provider, model: cfg.model, durationMs: Date.now() - startedAt, finishReason, usage: json?.usage || {} } });
  return { content, finishReason, raw: json };
}

function parseAiJsonObject(content: string, lang: TargetLang): Record<string, unknown> {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const candidates: string[] = [];
  const firstObj = cleaned.indexOf("{");
  const lastObj = cleaned.lastIndexOf("}");
  if (firstObj >= 0 && lastObj > firstObj) candidates.push(cleaned.slice(firstObj, lastObj + 1));
  const firstArr = cleaned.indexOf("[");
  const lastArr = cleaned.lastIndexOf("]");
  if (firstArr >= 0 && lastArr > firstArr) candidates.push(cleaned.slice(firstArr, lastArr + 1));

  for (const jsonText of candidates) {
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) return { translations: parsed };
      return parsed;
    } catch {
      try {
        const repaired = jsonText
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed)) return { translations: parsed };
        return parsed;
      } catch {
        // try next candidate
      }
    }
  }
  throw new Error(`AI: JSON troncato o assente (${lang})`);
}

function readTranslatedValue(parsed: any, id: string, originalKey: string, index: number): string | undefined {
  const direct = parsed?.[id] ?? parsed?.[originalKey] ?? parsed?.[String(index)] ?? parsed?.[index];
  if (typeof direct === "string") return direct;
  if (direct && typeof direct.translation === "string") return direct.translation;
  const containers = [parsed?.translations, parsed?.items, parsed?.results];
  for (const container of containers) {
    if (Array.isArray(container)) {
      const row = container.find((x) => x?.id === id || x?.key === originalKey || x?.index === index);
      const value = row?.translation ?? row?.value ?? row?.text;
      if (typeof value === "string") return value;
    } else if (container && typeof container === "object") {
      const value = container[id] ?? container[originalKey] ?? container[String(index)];
      if (typeof value === "string") return value;
      if (value && typeof value.translation === "string") return value.translation;
    }
  }
  return undefined;
}

async function requireAdmin(accessToken?: string): Promise<void> {
  if (!accessToken) throw new Error("Sessione admin non valida: effettua di nuovo il login.");
  // Prova prima con service role; se non disponibile, ripiega su publishable key + bearer token.
  let sb: ReturnType<typeof getServerSupabase>;
  try {
    sb = supabaseAdmin as unknown as ReturnType<typeof getServerSupabase>;
    // Forza una lettura di env per innescare l'errore "Missing Supabase env" subito.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("no service role");
  } catch {
    sb = getServerSupabase(accessToken);
  }
  const { data: userData, error } = await sb.auth.getUser(accessToken);
  const userId = userData?.user?.id;
  if (error || !userId) throw new Error("Sessione admin non valida: effettua di nuovo il login.");
  const { data: role } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) throw new Error("Permessi admin richiesti.");
}

/** Hash stabile (non-cryptografico) per invalidare quando cambia il sorgente. */
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function sourceKey(entityType: string, entityId: string, field: string, lang: string): string {
  return `${entityType}|${entityId}|${field}|${lang}`;
}

function sourceKeyNoLang(entityType: string, entityId: string, field: string): string {
  return `${entityType}|${entityId}|${field}`;
}

function parseCompositeKey(key: string): { entity_type: string; entity_id: string; field: string } | null {
  const parts = key.split("|");
  if (parts.length < 3) return null;
  const [entity_type, entity_id, ...fieldParts] = parts;
  return { entity_type, entity_id, field: fieldParts.join("|") };
}

type ExistingTranslation = { source_hash: string; value?: string | null };

function normalizeTranslationText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function hasItalianSignal(value: string): boolean {
  return /\b(e|di|del|della|delle|dei|con|per|senza|spedizione|gratuita|gratis|reso|garanzia|pagamenti|sicuri|acquista|compra|ora|carrello|negozio|prodotto|prodotti|scopri|vedi|tutto|offerta|sconto|risparmia|pezzi|giorni)\b/i.test(value);
}

function looksUntranslated(source: string, translated: string | null | undefined, field: string, lang: string): boolean {
  if (lang === "it" || !translated?.trim()) return false;
  if (field === "store_name") return false;
  const src = normalizeTranslationText(source);
  const out = normalizeTranslationText(translated);
  if (!src || !out || src !== out || src.length < 8) return false;
  if (["name", "seo_title"].includes(field)) return hasItalianSignal(source);
  return true;
}

function hasFreshTranslation(
  rows: ExistingTranslation[] | undefined,
  source: SourceItem,
  lang: TargetLang,
): boolean {
  const h = hashStr(source.text);
  return !!rows?.some((row) => row.source_hash === h && !looksUntranslated(source.text, row.value, source.field, lang));
}

/** Traduce un batch di stringhe in UNA singola lingua target via Google Gemini API.
 *  La chiave Gemini è OBBLIGATORIA: il fallback Lovable AI è stato rimosso. */
async function translateBatchSingleLang(
  items: { key: string; text: string }[],
  lang: TargetLang,
  aiCfg: AiConfig,
  ctx?: TranslateDebugContext,
): Promise<Record<string, string>> {
  const payloadItems = items.map((it, i) => {
    const parsedKey = parseCompositeKey(it.key);
    return {
      id: `f${i}`,
      key: it.key,
      entity_type: parsedKey?.entity_type || "content",
      entity_id: parsedKey?.entity_id || "unknown",
      field: parsedKey?.field || it.key,
      source_text: it.text,
    };
  });
  const numbered = JSON.stringify(payloadItems, null, 2);

  const sysPrompt = `You are a NATIVE ${LANG_NAMES[lang]} copywriter for a premium/luxury e-commerce brand — NOT a translator. Your job is to rewrite Italian source copy so it reads as if originally written by a native ${LANG_NAMES[lang]} speaker for the local ${lang} market.

ABSOLUTE PRIORITY: naturalness over literal fidelity. If a literal translation sounds robotic, awkward, or "AI/Google-translated", rewrite the sentence from scratch — keep the MEANING and INTENT, not the words or structure.

STYLE RULES:
- Sound fluent, modern, minimal and elegant — premium brand voice.
- Use expressions, idioms, syntax and vocabulary that REAL native speakers actually use in ${LANG_NAMES[lang]} marketing/e-commerce copy today.
- Adapt tone, sentence length and rhythm to local conventions (don't mirror Italian sentence structure).
- Localize for the target market (currency phrasing, measurement habits, formality level, cultural references) — don't just translate words.
- Avoid stiff, technical, overly formal, or word-for-word phrasing. No calques from Italian.
- Keep it concise: native marketing copy is usually tighter than literal translations.

PRESERVE EXACTLY (do not translate or alter): brand names, SKUs, model names, numbers, prices, URLs, email addresses, markdown syntax, HTML tags and attributes, placeholders like {var} or %s.

OUTPUT: Return ONLY valid JSON, no prose, no markdown fences. Shape MUST be exactly:
{ "translations": [{ "id": "f0", "translation": "..." }] }
Every input id must appear exactly once.`;

  const userPrompt = `Source language: Italian. Target language: ${LANG_NAMES[lang]} (${lang}).
Rewrite each source_text as a native ${LANG_NAMES[lang]} copywriter would write it for a premium e-commerce brand targeting the ${lang} market. Prioritize natural, native-sounding copy over literal accuracy. Keep the same id. Do not omit title/name, description_short, description_long, description_html, subtitle, variants, bullets, or SEO fields.

ITEMS_JSON:
${numbered}`;

  const debugBase = {
    lang,
    provider: aiCfg.provider,
    model: aiCfg.model,
    batchId: ctx?.batchId || `${lang}-${Date.now()}`,
    batchIndex: ctx?.batchIndex ?? 1,
    totalBatches: ctx?.totalBatches ?? 1,
    attempt: ctx?.attempt ?? 1,
    mode: ctx?.mode || "batch",
    itemKeys: items.map((it) => it.key),
    chars: numbered.length,
  };

  await logGeminiDebug({ level: "info", lang, message: `${aiCfg.provider} request ${lang} batch ${debugBase.batchIndex}/${debugBase.totalBatches}`, metadata: debugBase });

  const { content, finishReason } = await callAiCompletion({ cfg: aiCfg, systemPrompt: sysPrompt, userPrompt, lang, debugBase });
  if (!content) throw new Error(`${aiCfg.provider} risposta vuota (${lang}), finishReason=${finishReason}`);

  const parsed = parseAiJsonObject(content, lang) as any;
  const out: Record<string, string> = {};
  items.forEach((it, i) => {
    const v = readTranslatedValue(parsed, `f${i}`, it.key, i);
    if (typeof v === "string" && v.trim()) out[it.key] = v.trim();
  });
  return out;
}


async function translateHtmlFieldReliable(
  item: { key: string; text: string },
  lang: TargetLang,
  aiCfg: AiConfig,
  ctx: TranslateDebugContext,
): Promise<string> {
  const { template, parts } = splitHtmlForTranslation(item.text);
  if (parts.length === 0) return item.text;
  const translatedParts = new Map<string, string>();
  const CHUNK = 8;
  for (let start = 0; start < parts.length; start += CHUNK) {
    const slice = parts.slice(start, start + CHUNK);
    const chunkItems = slice.map((part, index) => ({
      key: `${item.key}|html_text_${start + index}`,
      text: part.text,
    }));
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_SINGLE_ATTEMPTS; attempt++) {
      try {
        const map = await translateBatchSingleLang(chunkItems, lang, aiCfg, {
          ...ctx,
          attempt,
          mode: "single",
        });
        const missing = chunkItems.filter((chunk) => !map[chunk.key]);
        if (missing.length === 0) {
          slice.forEach((part, index) => {
            const key = chunkItems[index].key;
            translatedParts.set(part.placeholder, `${part.leading}${map[key]}${part.trailing}`);
          });
          lastError = undefined;
          break;
        }
        lastError = new Error(`HTML chunk parziale: ${missing.map((m) => m.key).join(", ")}`);
      } catch (e) {
        lastError = e;
        if (isNonRetryableAiError(e)) break;
        await sleep(500 * attempt);
      }
    }
    if (lastError) throw lastError;
  }
  let translatedHtml = template;
  for (const part of parts) {
    translatedHtml = translatedHtml.replace(part.placeholder, translatedParts.get(part.placeholder) || `${part.leading}${part.text}${part.trailing}`);
  }
  return translatedHtml;
}

async function translateBatchReliable(
  items: { key: string; text: string }[],
  lang: TargetLang,
  aiCfg: AiConfig,
  batchIndex: number,
  totalBatches: number,
): Promise<{ map: Record<string, string>; failedKeys: string[]; status: "translated" | "partially_translated" | "failed"; errorMessage?: string }> {
  const batchId = `${lang}-${Date.now()}-${batchIndex}`;
  const htmlItems = items.filter((item) => isHtmlTranslationField(item.key) && item.text.length > 900);
  if (htmlItems.length > 0) {
    const regularItems = items.filter((item) => !htmlItems.includes(item));
    const map: Record<string, string> = {};
    const failedKeys: string[] = [];
    let errorMessage: string | undefined;
    if (regularItems.length > 0) {
      const regular = await translateBatchReliable(regularItems, lang, aiCfg, batchIndex, totalBatches);
      Object.assign(map, regular.map);
      failedKeys.push(...regular.failedKeys);
      if (regular.errorMessage) errorMessage = regular.errorMessage;
    }
    for (const item of htmlItems) {
      try {
        map[item.key] = await translateHtmlFieldReliable(item, lang, aiCfg, { batchId, batchIndex, totalBatches, attempt: 1, mode: "single" });
      } catch (e) {
        failedKeys.push(item.key);
        errorMessage = e instanceof Error ? e.message : String(e || "");
        await logGeminiDebug({
          level: "error",
          lang,
          message: `HTML field failed ${lang}`,
          metadata: { batchId, batchIndex, totalBatches, itemKeys: [item.key], error: errorMessage },
        });
      }
    }
    return {
      map,
      failedKeys,
      status: failedKeys.length === 0 ? "translated" : Object.keys(map).length > 0 ? "partially_translated" : "failed",
      errorMessage,
    };
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
    try {
      const map = await translateBatchSingleLang(items, lang, aiCfg, { batchId, batchIndex, totalBatches, attempt, mode: "batch" });
      const missing = items.map((it) => it.key).filter((key) => !map[key]);
      if (missing.length === 0) return { map, failedKeys: [], status: "translated" };
      lastError = new Error(`Risposta parziale: ${missing.length}/${items.length} mancanti`);
      await logGeminiDebug({ level: "warning", lang, message: `Batch parziale ${lang}: retry parti fallite`, metadata: { batchId, batchIndex, totalBatches, attempt, missing } });
      break;
    } catch (e) {
      lastError = e;
      console.warn(`[translate] batch retry ${attempt}/${MAX_BATCH_ATTEMPTS} per ${lang}`, e);
      if (isNonRetryableAiError(e) || attempt === MAX_BATCH_ATTEMPTS) break;
      await sleep(700 * attempt);
    }
  }

  const out: Record<string, string> = {};
  const failedKeys: string[] = [];
  for (const item of items) {
    let translated = false;
    for (let attempt = 1; attempt <= MAX_SINGLE_ATTEMPTS; attempt++) {
      try {
        Object.assign(out, await translateBatchSingleLang([item], lang, aiCfg, { batchId, batchIndex, totalBatches, attempt, mode: "single" }));
        translated = !!out[item.key];
        if (translated) break;
      } catch (singleError) {
        lastError = singleError;
        console.error(`[translate] item retry ${attempt}/${MAX_SINGLE_ATTEMPTS} failed ${lang} ${item.key}`, singleError);
        if (isNonRetryableAiError(singleError)) break;
        await sleep(500 * attempt);
      }
    }
    if (!translated) failedKeys.push(item.key);
  }

  const errorMessage = lastError instanceof Error ? lastError.message : lastError ? String(lastError) : undefined;
  const status = failedKeys.length === 0 ? "translated" : out && Object.keys(out).length > 0 ? "partially_translated" : "failed";
  await logGeminiDebug({
    level: status === "translated" ? "success" : status === "partially_translated" ? "warning" : "error",
    lang,
    message: `Batch ${status} ${lang}`,
    metadata: { batchId, batchIndex, totalBatches, failedKeys, lastError: errorMessage },
  });
  return { map: out, failedKeys, status, errorMessage };
}

/** Test active AI provider configured in settings (provider/model/api key). */
export const testGeminiApiKey = createServerFn({ method: "POST" })
  .inputValidator((input: { key?: string; accessToken?: string; provider?: AiProvider; model?: string } | undefined) => input || {})
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    let cfg = await resolveAiConfig();
    if (data.provider) cfg = { ...cfg, provider: data.provider };
    if (data.model) cfg = { ...cfg, model: data.model };
    if (data.key && data.key.trim()) cfg = { ...cfg, apiKey: data.key.trim() };
    if (cfg.provider === "lovable" && !cfg.apiKey) cfg.apiKey = process.env.LOVABLE_API_KEY?.trim();

    if (!cfg.apiKey) return { ok: false, message: `Nessuna API key configurata per "${cfg.provider}".` };

    const startedAt = Date.now();
    try {
      const { content, finishReason } = await callAiCompletion({
        cfg,
        systemPrompt: "Reply with only: OK",
        userPrompt: "Reply with only: OK",
        lang: "en",
        debugBase: { kind: "test" },
      });
      return { ok: true, message: `API ${cfg.provider} attiva (${cfg.model})`, sample: content?.slice(0, 80) || "OK", finishReason, durationMs: Date.now() - startedAt };
    } catch (e) {
      return { ok: false, message: (e as Error).message || "Test fallito" };
    }
  });

export const chatWithGemini = createServerFn({ method: "POST" })
  .inputValidator((input: { messages?: Array<{ role: "user" | "model"; text: string }>; accessToken?: string } | undefined) => input || {})
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const messages = Array.isArray(data.messages) ? data.messages : [];
    if (!messages.length) return { ok: false, message: "Nessun messaggio." };

    const cfg = await resolveAiConfig();
    if (!cfg.apiKey) return { ok: false, message: `Nessuna API key configurata per "${cfg.provider}". Salvala in Impostazioni → AI.` };

    const startedAt = Date.now();
    try {
      if (cfg.provider === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
        const body = {
          contents: messages.map((m) => ({
            role: m.role === "model" ? "model" : "user",
            parts: [{ text: String(m.text || "").slice(0, 8000) }],
          })),
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        };
        const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const durationMs = Date.now() - startedAt;
        if (!resp.ok) {
          const txt = await resp.text();
          return { ok: false, message: `${cfg.provider} ${resp.status}: ${txt.slice(0, 240)}`, durationMs, source: cfg.source };
        }
        const json = await resp.json();
        const reply = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("").trim() || "";
        const finishReason = json?.candidates?.[0]?.finishReason;
        return { ok: true, reply, finishReason, durationMs, source: cfg.source, model: cfg.model, provider: cfg.provider };
      }
      // OpenAI-compatible
      const endpoint = cfg.provider === "lovable"
        ? "https://ai.gateway.lovable.dev/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions";
      const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` };
      if (cfg.provider === "openrouter") {
        headers["HTTP-Referer"] = process.env.SUPABASE_URL || "https://lovable.dev";
        headers["X-Title"] = "CRM Chat";
      }
      const body = {
        model: cfg.model,
        messages: messages.map((m) => ({ role: m.role === "model" ? "assistant" : "user", content: String(m.text || "").slice(0, 8000) })),
        temperature: 0.7,
      };
      const resp = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
      const durationMs = Date.now() - startedAt;
      if (!resp.ok) {
        const txt = await resp.text();
        return { ok: false, message: `${cfg.provider} ${resp.status}: ${txt.slice(0, 240)}`, durationMs, source: cfg.source };
      }
      const json = await resp.json();
      const reply = json?.choices?.[0]?.message?.content || "";
      const finishReason = json?.choices?.[0]?.finish_reason;
      return { ok: true, reply, finishReason, durationMs, source: cfg.source, model: cfg.model, provider: cfg.provider };
    } catch (e) {
      return { ok: false, message: (e as Error).message || "Errore chat AI", durationMs: Date.now() - startedAt, source: cfg.source };
    }
  });

/** Restituisce la configurazione AI attuale per l'UI Settings. */
export const getAiConfig = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken?: string } | undefined) => input || {})
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const cfg = await resolveAiConfig();
    return {
      provider: cfg.provider,
      model: cfg.model,
      hasApiKey: !!cfg.apiKey,
      source: cfg.source,
      lovableKeyAvailable: !!process.env.LOVABLE_API_KEY,
    };
  });



interface SourceItem {
  entity_type: string;
  entity_id: string;
  field: string;
  text: string;
}

type ProductFieldGroup = "titles" | "descriptions" | "variants" | "quantity_breaks";

const PRODUCT_FIELD_GROUPS: ProductFieldGroup[] = ["titles", "descriptions", "variants", "quantity_breaks"];

function normalizeProductFieldGroups(groups?: string[]): ProductFieldGroup[] {
  const allowed = new Set<ProductFieldGroup>(PRODUCT_FIELD_GROUPS);
  const clean = (groups || []).filter((g): g is ProductFieldGroup => allowed.has(g as ProductFieldGroup));
  return clean.length > 0 ? Array.from(new Set(clean)) : PRODUCT_FIELD_GROUPS;
}

function productFieldMatchesGroups(field: string, groups: ProductFieldGroup[]): boolean {
  if (groups.includes("titles") && ["name", "subtitle", "seo_title"].includes(field)) return true;
  if (groups.includes("descriptions") && ["description_short", "description_long", "description_html", "shipping_returns_html", "seo_description", "trust_badge_text"].includes(field)) return true;
  if (groups.includes("descriptions") && field.startsWith("bullet_") && field.endsWith("_text")) return true;
  if (groups.includes("variants") && field.startsWith("variant_") && field.endsWith("_label")) return true;
  if (groups.includes("quantity_breaks") && field.startsWith("break_")) return true;
  return false;
}

async function collectProductSources(fieldGroups?: string[], entityIds?: string[]): Promise<SourceItem[]> {
  const items: SourceItem[] = [];
  const groups = normalizeProductFieldGroups(fieldGroups);
  const add = (entity_id: string, field: string, text: unknown) => {
    const value = typeof text === "string" ? text.trim() : "";
    if (value && productFieldMatchesGroups(field, groups)) items.push({ entity_type: "product", entity_id, field, text: value });
  };

  let query = supabaseAdmin
    .from("products")
    .select("id, name, subtitle, trust_badge_text, description_short, description_long, description_html, shipping_returns_html, seo_title, seo_description, bullets, variants, quantity_breaks");
  if (entityIds && entityIds.length) query = query.in("id", entityIds);
  const { data: products } = await query;
  for (const p of products || []) {
    add(p.id, "name", p.name);
    add(p.id, "subtitle", (p as any).subtitle);
    add(p.id, "trust_badge_text", (p as any).trust_badge_text);
    add(p.id, "description_short", p.description_short);
    add(p.id, "description_long", p.description_long);
    add(p.id, "description_html", (p as any).description_html);
    add(p.id, "shipping_returns_html", (p as any).shipping_returns_html);
    add(p.id, "seo_title", p.seo_title);
    add(p.id, "seo_description", p.seo_description);
    const bullets = Array.isArray((p as any).bullets) ? (p as any).bullets : [];
    bullets.forEach((b: any, i: number) => add(p.id, `bullet_${i}_text`, b?.text));
    const variants = Array.isArray(p.variants) ? p.variants : [];
    variants.forEach((v: any, i: number) => add(p.id, `variant_${i}_label`, v?.label));
    const breaks = Array.isArray(p.quantity_breaks) ? p.quantity_breaks : [];
    breaks.forEach((b: any, i: number) => {
      add(p.id, `break_${i}_label`, b?.label);
      add(p.id, `break_${i}_badge`, b?.badge);
    });
  }
  return items;
}

function collectUiSources(): SourceItem[] {
  return Object.entries(__DICT__).flatMap(([field, values]) => {
    const text = typeof values.it === "string" ? values.it.trim() : "";
    return text ? [{ entity_type: "ui", entity_id: "i18n", field, text }] : [];
  });
}

/** Raccoglie tutti i contenuti tradotti dal DB. */
async function collectAllSources(): Promise<SourceItem[]> {
  const items: SourceItem[] = [];

  const productSources = await collectProductSources(PRODUCT_FIELD_GROUPS);
  items.push(...productSources);

  // Pagine legali
  const { data: legals } = await supabaseAdmin.from("legal_pages").select("slug, title, body_markdown");
  for (const l of legals || []) {
    if (l.title) items.push({ entity_type: "legal_page", entity_id: l.slug, field: "title", text: l.title });
    if (l.body_markdown)
      items.push({ entity_type: "legal_page", entity_id: l.slug, field: "body_markdown", text: l.body_markdown });
  }

  // Categorie
  const { data: cats } = await supabaseAdmin.from("categories").select("id, name, description");
  for (const c of cats || []) {
    if (c.name) items.push({ entity_type: "category", entity_id: c.id, field: "name", text: c.name });
    if (c.description) items.push({ entity_type: "category", entity_id: c.id, field: "description", text: c.description });
  }

  // Footer (incluso footer_description)
  const { data: footer } = await supabaseAdmin.from("footer_config").select("id, newsletter_title, newsletter_subtitle, copyright_text, footer_description, links").limit(1).maybeSingle();
  if (footer) {
    const f: any = footer;
    if (f.newsletter_title)
      items.push({ entity_type: "footer", entity_id: f.id, field: "newsletter_title", text: f.newsletter_title });
    if (f.newsletter_subtitle)
      items.push({ entity_type: "footer", entity_id: f.id, field: "newsletter_subtitle", text: f.newsletter_subtitle });
    if (f.copyright_text)
      items.push({ entity_type: "footer", entity_id: f.id, field: "copyright_text", text: f.copyright_text });
    if (f.footer_description)
      items.push({ entity_type: "footer", entity_id: f.id, field: "footer_description", text: f.footer_description });
    const links = Array.isArray(f.links) ? f.links : [];
    links.forEach((l: any, i: number) => {
      if (l?.label) items.push({ entity_type: "footer", entity_id: f.id, field: `link_${i}_label`, text: String(l.label) });
    });
  }

  // Branding (top banner / horizon / OG / store name)
  const { data: branding } = await supabaseAdmin
    .from("site_branding")
    .select("id, store_name, top_banner_text, horizon_text, header_tagline, og_title, og_description, default_product_tagline")
    .limit(1)
    .maybeSingle();
  if (branding) {
    const b: any = branding;
    if (b.store_name) items.push({ entity_type: "branding", entity_id: b.id, field: "store_name", text: b.store_name });
    if (b.top_banner_text) items.push({ entity_type: "branding", entity_id: b.id, field: "top_banner_text", text: b.top_banner_text });
    if (b.horizon_text) items.push({ entity_type: "branding", entity_id: b.id, field: "horizon_text", text: b.horizon_text });
    if (b.header_tagline) items.push({ entity_type: "branding", entity_id: b.id, field: "header_tagline", text: b.header_tagline });
    if (b.og_title) items.push({ entity_type: "branding", entity_id: b.id, field: "og_title", text: b.og_title });
    if (b.og_description) items.push({ entity_type: "branding", entity_id: b.id, field: "og_description", text: b.og_description });
    if (b.default_product_tagline) items.push({ entity_type: "branding", entity_id: b.id, field: "default_product_tagline", text: b.default_product_tagline });
  }

  items.push(...collectUiSources());

  return items;
}

async function collectStoreSources(): Promise<SourceItem[]> {
  const all = await collectAllSources();
  return all.filter((item) => item.entity_type !== "product");
}

async function recordTranslationFailures(rows: Array<SourceItem & { lang: TargetLang; error?: string }>) {
  if (!rows.length) return;
  const payload = rows.map((r) => ({
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    field: r.field,
    lang: r.lang,
    source_hash: hashStr(r.text),
    status: "failed",
    attempts: 1,
    last_error: r.error || "Translation missing from AI response",
  }));
  const db = supabaseAdmin as any;
  const { error } = await db.from("translation_failures").upsert(payload, { onConflict: "entity_type,entity_id,field,lang" });
  if (error) console.warn("[translate] failure upsert failed", error);
}

async function clearTranslationFailures(rows: Array<SourceItem & { lang: TargetLang }>) {
  if (!rows.length) return;
  const db = supabaseAdmin as any;
  for (const r of rows) {
    await db
      .from("translation_failures")
      .delete()
      .eq("entity_type", r.entity_type)
      .eq("entity_id", r.entity_id)
      .eq("field", r.field)
      .eq("lang", r.lang);
  }
}

/**
 * Rigenera l'intera cache traduzioni. Salta i record già aggiornati (source_hash invariato).
 * Usa batch da 20 stringhe per round-trip.
 */
export const regenerateAllTranslations = createServerFn({ method: "POST" })
  .inputValidator((input: { force?: boolean; accessToken?: string; lang?: string }) => input || {})
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const aiCfg = await resolveAiConfig();
    if (!aiCfg.apiKey && aiCfg.provider !== "lovable") {
      throw new Error(
        `API key mancante per provider "${aiCfg.provider}". Configurala in Impostazioni → AI.`,
      );
    }
    if (aiCfg.provider === "lovable" && !aiCfg.apiKey) {
      throw new Error("LOVABLE_API_KEY non disponibile sul server. Riattiva Lovable AI dal pannello Cloud.");
    }
    console.log(`[translate] using ${aiCfg.provider}/${aiCfg.model}`);
    const targetLangs: TargetLang[] = data.lang && TARGET_LANGS.includes(data.lang as TargetLang)
      ? [data.lang as TargetLang]
      : [...TARGET_LANGS];

    const force = !!data.force;
    const sources = await collectAllSources();
    if (sources.length === 0) return { translated: 0, skipped: 0, total: 0 };

    const existingByKey = new Map<string, ExistingTranslation[]>();
    if (!force) {
      const { data: existing } = await supabaseAdmin
        .from("translations")
        .select("entity_type, entity_id, field, lang, source_hash, value");
      for (const r of existing || []) {
        const k = sourceKey(r.entity_type, r.entity_id, r.field, r.lang);
        if (!existingByKey.has(k)) existingByKey.set(k, []);
        existingByKey.get(k)!.push({ source_hash: r.source_hash ?? "", value: (r as any).value });
      }
    }

    const failedByKey = new Set<string>();
    if (!force) {
      const db = supabaseAdmin as any;
      const { data: failedRows } = await db
        .from("translation_failures")
        .select("entity_type, entity_id, field, lang, source_hash, status")
        .in("lang", targetLangs)
        .eq("status", "failed");
      for (const r of failedRows || []) {
        failedByKey.add(sourceKey(r.entity_type, r.entity_id, r.field, r.lang));
      }
    }

    const toTranslate = sources.filter((s) => {
      for (const lang of targetLangs) {
        const k = sourceKey(s.entity_type, s.entity_id, s.field, lang);
        const rows = existingByKey.get(k);
        if (failedByKey.has(k) || !hasFreshTranslation(rows, s, lang)) return true;
      }
      return false;
    });

    // Cleanup orfani
    const sourceKeys = new Set(sources.map((s) => sourceKeyNoLang(s.entity_type, s.entity_id, s.field)));
    const { data: allExisting } = await supabaseAdmin
      .from("translations")
      .select("id, entity_type, entity_id, field")
      .in("entity_type", TRACKED_TYPES);
    const orphanIds: string[] = [];
    for (const r of allExisting || []) {
      const k = sourceKeyNoLang(r.entity_type, r.entity_id, r.field);
      if (!sourceKeys.has(k)) orphanIds.push((r as any).id);
    }
    let deleted = 0;
    if (orphanIds.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < orphanIds.length; i += CHUNK) {
        const ch = orphanIds.slice(i, i + CHUNK);
        const { error } = await supabaseAdmin.from("translations").delete().in("id", ch);
        if (!error) deleted += ch.length;
      }
    }

    let translated = 0;
    let failed = 0;
    let partiallyTranslated = 0;
    const BATCH = 3;

    for (const lang of targetLangs) {
      const needed = toTranslate.filter((s) => {
        const k = sourceKey(s.entity_type, s.entity_id, s.field, lang);
        const rows = existingByKey.get(k);
        return failedByKey.has(k) || !hasFreshTranslation(rows, s, lang);
      });
      if (needed.length === 0) continue;

      const batches: SourceItem[][] = [];
      for (let i = 0; i < needed.length; i += BATCH) batches.push(needed.slice(i, i + BATCH));

      for (let i = 0; i < batches.length; i++) {
        const slice = batches[i];
        const items = slice.map((s) => ({ key: sourceKeyNoLang(s.entity_type, s.entity_id, s.field), text: s.text }));
        let result: { map: Record<string, string>; status: "translated" | "partially_translated" | "failed"; failedKeys: string[]; errorMessage?: string };
        try {
          result = await translateBatchReliable(items, lang, aiCfg, i + 1, batches.length);
        } catch (e) {
          console.error(`translate ${lang} batch failed`, e);
          result = { map: {}, status: "failed", failedKeys: items.map((it) => it.key), errorMessage: e instanceof Error ? e.message : String(e || "") };
        }
        if (result.status === "partially_translated") partiallyTranslated++;

        const rows: any[] = [];
        const failureRows: Array<SourceItem & { lang: TargetLang; error?: string }> = [];
        const successRows: Array<SourceItem & { lang: TargetLang }> = [];
        for (const s of slice) {
          const k = sourceKeyNoLang(s.entity_type, s.entity_id, s.field);
          const v = result.map[k];
          if (!v) {
            failed++;
            failureRows.push({ ...s, lang, error: result.errorMessage || `Campo non restituito da Gemini: ${s.field}` });
            continue;
          }
          rows.push({
            entity_type: s.entity_type,
            entity_id: s.entity_id,
            field: s.field,
            lang,
            value: v,
            source_hash: hashStr(s.text),
          });
          translated++;
          successRows.push({ ...s, lang });
        }
        if (failureRows.length > 0) await recordTranslationFailures(failureRows);
        if (successRows.length > 0) await clearTranslationFailures(successRows);
        if (rows.length > 0) {
          const { error } = await supabaseAdmin
            .from("translations")
            .upsert(rows, { onConflict: "entity_type,entity_id,field,lang" });
          if (error) throw new Error(`Salvataggio traduzioni fallito: ${error.message}`);
        }
      }
    }

    return {
      translated,
      skipped: sources.length - toTranslate.length,
      total: sources.length,
      deleted,
      failed,
      partiallyTranslated,
      status: failed > 0 ? "partially_translated" : "translated",
      provider: "gemini",
    };
  });

/**
 * Step traduzione granulare per progress bar live.
 * Ritorna i campi che restano da tradurre per ciascuna lingua,
 * raggruppati per entity (così il client vede "Prodotto X · campi Y").
 */
export const getTranslationPlan = createServerFn({ method: "POST" })
  .inputValidator((input: { force?: boolean; accessToken?: string; fieldGroups?: string[]; entityIds?: string[]; langs?: string[]; scope?: "products" | "store" | "all" } | undefined) => input || {})
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const aiCfg = await resolveAiConfig();
    const missingKey = !aiCfg.apiKey;
    if (missingKey) {
      return {
        ok: false as const,
        error: `API key mancante per provider "${aiCfg.provider}". Configurala in Impostazioni → AI.`,
        steps: [] as Array<{ lang: TargetLang; entity_type: string; entity_id: string; entity_label: string; fields: string[]; count: number }>,
        totalFields: 0,
        totalEntities: 0,
        totalLangs: 0,
      };
    }

    const force = !!data.force;
    const scope = data.scope || "products";
    const sources = scope === "store"
      ? await collectStoreSources()
      : scope === "all"
        ? await collectAllSources()
        : await collectProductSources(data.fieldGroups, data.entityIds);
    if (sources.length === 0) {
      return { ok: true as const, steps: [], totalFields: 0, totalEntities: 0, totalLangs: 0 };
    }

    const existingByKey = new Map<string, ExistingTranslation[]>();
    if (!force) {
      const { data: existing } = await supabaseAdmin
        .from("translations")
        .select("entity_type, entity_id, field, lang, source_hash, value");
      for (const r of existing || []) {
        const k = sourceKey(r.entity_type, r.entity_id, r.field, r.lang);
        if (!existingByKey.has(k)) existingByKey.set(k, []);
        existingByKey.get(k)!.push({ source_hash: r.source_hash ?? "", value: (r as any).value });
      }
    }

    const failedByKey = new Set<string>();
    if (!force) {
      const db = supabaseAdmin as any;
      const { data: failedRows } = await db
        .from("translation_failures")
        .select("entity_type, entity_id, field, lang, status")
        .eq("status", "failed");
      for (const r of failedRows || []) {
        failedByKey.add(sourceKey(r.entity_type, r.entity_id, r.field, r.lang));
      }
    }

    // Etichette amichevoli (nome prodotto, slug pagina, ecc.)
    const productLabels = new Map<string, string>();
    {
      const ids = Array.from(new Set(sources.filter((s) => s.entity_type === "product").map((s) => s.entity_id)));
      if (ids.length) {
        const { data: rows } = await supabaseAdmin.from("products").select("id, name").in("id", ids);
        for (const r of rows || []) productLabels.set(r.id, r.name || r.id);
      }
    }
    const labelFor = (entity_type: string, entity_id: string): string => {
      if (entity_type === "product") return productLabels.get(entity_id) || entity_id;
      if (entity_type === "legal_page") return entity_id;
      if (entity_type === "category") return entity_id;
      if (entity_type === "footer") return "Footer";
      if (entity_type === "branding") return "Branding";
      if (entity_type === "ui") return "Testi UI / Home";
      return entity_id;
    };

    const langsFilter = Array.isArray(data.langs) && data.langs.length
      ? (TARGET_LANGS.filter((l) => data.langs!.includes(l)) as TargetLang[])
      : (TARGET_LANGS as readonly TargetLang[]);
    const stepMap = new Map<string, { lang: TargetLang; entity_type: string; entity_id: string; entity_label: string; fields: string[]; count: number }>();
    for (const s of sources) {
      for (const lang of langsFilter) {
        const k = sourceKey(s.entity_type, s.entity_id, s.field, lang);
        const rows = existingByKey.get(k);
        const needs = failedByKey.has(k) || !hasFreshTranslation(rows, s, lang);
        if (!needs) continue;
        const groupKey = `${lang}|${s.entity_type}|${s.entity_id}`;
        let group = stepMap.get(groupKey);
        if (!group) {
          group = { lang, entity_type: s.entity_type, entity_id: s.entity_id, entity_label: labelFor(s.entity_type, s.entity_id), fields: [], count: 0 };
          stepMap.set(groupKey, group);
        }
        group.fields.push(s.field);
        group.count++;
      }
    }

    const splitStepFields = (group: { lang: TargetLang; entity_type: string; entity_id: string; entity_label: string; fields: string[]; count: number }) => {
      const maxFields = group.entity_type === "ui" ? 12 : 24;
      if (group.fields.length <= maxFields) return [group];
      const out: typeof group[] = [];
      for (let i = 0; i < group.fields.length; i += maxFields) {
        const fields = group.fields.slice(i, i + maxFields);
        out.push({ ...group, fields, count: fields.length, entity_label: `${group.entity_label} ${Math.floor(i / maxFields) + 1}` });
      }
      return out;
    };
    const steps = Array.from(stepMap.values()).flatMap(splitStepFields).sort((a, b) => {
      if (a.entity_type !== b.entity_type) return a.entity_type.localeCompare(b.entity_type);
      if (a.entity_label !== b.entity_label) return a.entity_label.localeCompare(b.entity_label);
      return a.lang.localeCompare(b.lang);
    });

    const totalFields = steps.reduce((n, s) => n + s.count, 0);
    const totalEntities = new Set(steps.map((s) => `${s.entity_type}|${s.entity_id}`)).size;
    const totalLangs = new Set(steps.map((s) => s.lang)).size;

    return { ok: true as const, steps, totalFields, totalEntities, totalLangs };
  });

/** Esegue UNO step: traduce tutti i campi mancanti per una entity in una lingua.
 *  Ritorna esito per progress bar live (campi tradotti/falliti + errore se presente). */
export const translateOneStep = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken?: string; lang: string; entity_type: string; entity_id: string; force?: boolean; fieldGroups?: string[]; fields?: string[]; scope?: "products" | "store" | "all" }) => input)
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const aiCfg = await resolveAiConfig();
    if (!aiCfg.apiKey) {
      return { ok: false as const, translated: 0, failed: 0, error: `API key mancante per provider "${aiCfg.provider}". Configurala in Impostazioni → AI.`, failedFields: [] as string[] };
    }
    if (!TARGET_LANGS.includes(data.lang as TargetLang)) {
      return { ok: false as const, translated: 0, failed: 0, error: `Lingua non supportata: ${data.lang}`, failedFields: [] };
    }
    const lang = data.lang as TargetLang;

    // Raccogli sorgenti per questa entity
    const scope = data.scope || "products";
    const allSources = scope === "store"
      ? await collectStoreSources()
      : scope === "all"
        ? await collectAllSources()
        : await collectProductSources(data.fieldGroups);
    const fieldsFilter = Array.isArray(data.fields) && data.fields.length ? new Set(data.fields) : null;
    const entitySources = allSources.filter((s) => s.entity_type === data.entity_type && s.entity_id === data.entity_id && (!fieldsFilter || fieldsFilter.has(s.field)));
    if (entitySources.length === 0) {
      return { ok: true as const, translated: 0, failed: 0, skipped: 0, failedFields: [] };
    }

    // Calcola quali campi mancano per questa lingua
    const force = !!data.force;
    const existingHashByField = new Map<string, string>();
    if (!force) {
      const { data: existing } = await supabaseAdmin
        .from("translations")
        .select("field, source_hash, value")
        .eq("entity_type", data.entity_type)
        .eq("entity_id", data.entity_id)
        .eq("lang", lang);
      for (const r of existing || []) {
        if (!looksUntranslated(entitySources.find((s) => s.field === r.field)?.text || "", (r as any).value, r.field, lang)) {
          existingHashByField.set(r.field, r.source_hash ?? "");
        }
      }
    }
    const failedFieldsExisting = new Set<string>();
    if (!force) {
      const db = supabaseAdmin as any;
      const { data: f } = await db
        .from("translation_failures")
        .select("field")
        .eq("entity_type", data.entity_type)
        .eq("entity_id", data.entity_id)
        .eq("lang", lang)
        .eq("status", "failed");
      for (const r of f || []) failedFieldsExisting.add(r.field);
    }

    const needed = entitySources.filter((s) => {
      const h = hashStr(s.text);
      return failedFieldsExisting.has(s.field) || existingHashByField.get(s.field) !== h;
    });
    const skipped = entitySources.length - needed.length;
    if (needed.length === 0) {
      return { ok: true as const, translated: 0, failed: 0, skipped, failedFields: [] };
    }

    const STEP_BATCH = data.entity_type === "ui" ? 8 : 4;
    const chunks: SourceItem[][] = [];
    for (let i = 0; i < needed.length; i += STEP_BATCH) chunks.push(needed.slice(i, i + STEP_BATCH));

    const rows: any[] = [];
    const failureRows: Array<SourceItem & { lang: TargetLang; error?: string }> = [];
    const successRows: Array<SourceItem & { lang: TargetLang }> = [];
    const failedFields: string[] = [];
    let translated = 0;
    let failed = 0;
    let lastError: string | undefined;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const items = chunk.map((s) => ({ key: sourceKeyNoLang(s.entity_type, s.entity_id, s.field), text: s.text }));
      let result: { map: Record<string, string>; status: "translated" | "partially_translated" | "failed"; failedKeys: string[]; errorMessage?: string };
      try {
        result = await translateBatchReliable(items, lang, aiCfg, i + 1, chunks.length);
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e || "");
        result = { map: {}, status: "failed", failedKeys: items.map((item) => item.key), errorMessage: lastError };
      }
      if (result.errorMessage) lastError = result.errorMessage;
      for (const s of chunk) {
        const k = sourceKeyNoLang(s.entity_type, s.entity_id, s.field);
        const v = result.map[k];
        if (!v) {
          failed++;
          failedFields.push(s.field);
          failureRows.push({ ...s, lang, error: result.errorMessage || `Campo non restituito dall'AI: ${s.field}` });
          continue;
        }
        rows.push({
          entity_type: s.entity_type,
          entity_id: s.entity_id,
          field: s.field,
          lang,
          value: v,
          source_hash: hashStr(s.text),
        });
        translated++;
        successRows.push({ ...s, lang });
      }
    }
    if (failureRows.length > 0) await recordTranslationFailures(failureRows);
    if (successRows.length > 0) await clearTranslationFailures(successRows);
    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from("translations")
        .upsert(rows, { onConflict: "entity_type,entity_id,field,lang" });
      if (error) {
        return { ok: false as const, translated: 0, failed: needed.length, skipped, error: `Salvataggio fallito: ${error.message}`, failedFields: needed.map((s) => s.field) };
      }
    }

    return {
      ok: failed === 0,
      translated,
      failed,
      skipped,
      failedFields,
      error: failed > 0 ? (lastError || `${failed} campo/i non tradotti`) : undefined,
    };
  });

export const getTranslationFailures = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken?: string } | undefined) => input || {})
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const db = supabaseAdmin as any;
    const { data: rows } = await db
      .from("translation_failures")
      .select("entity_type, entity_id, field, lang, status, attempts, last_error, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(300);
    return { rows: rows || [] };
  });

/** Ritorna le traduzioni per una lingua per più entità (uso pubblico, niente service role). */
export const getTranslations = createServerFn({ method: "POST" })
  .inputValidator((input: { lang: string; entity_type: string; entity_ids: string[] }) => input)
  .handler(async ({ data }) => {
    if (!TARGET_LANGS.includes(data.lang as TargetLang)) return { rows: [] };
    if (!data.entity_ids?.length) return { rows: [] };
    const { data: rows } = await supabaseAdmin
      .from("translations")
      .select("entity_id, field, value")
      .eq("entity_type", data.entity_type)
      .eq("lang", data.lang)
      .in("entity_id", data.entity_ids);
    return { rows: rows || [] };
  });
