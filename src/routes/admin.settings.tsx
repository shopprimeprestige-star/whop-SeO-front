import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, AlertCircle, CheckCircle2, Globe2, Activity, Clock, Sparkles, ExternalLink } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { testGeminiApiKey, chatWithGemini, getAiConfig, type AiProvider } from "@/lib/translate.functions";
import { exportFullBackup } from "@/lib/backup.functions";
import { Textarea } from "@/components/ui/textarea";
import { Send, MessageSquare, Bot, User as UserIcon } from "lucide-react";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Impostazioni" }] }),
});

// ========== Schemas ==========

const rotationSchema = z.object({
  enable_rotation: z.boolean(),
  default_rotation_threshold: z
    .number({ invalid_type_error: "Numero richiesto" })
    .int("Deve essere intero")
    .min(1, "Min 1")
    .max(1_000_000, "Max 1.000.000"),
  default_cap_amount: z.number().min(0).max(1_000_000),
  default_cap_window_days: z.number().int().min(1).max(365),
  rotation_random_variance: z.number().min(0, "Min 0%").max(100, "Max 100%"),
  weekend_threshold_multiplier: z.number().min(0.1).max(10),
  no_rotation_hours_start: z.number().int().min(0).max(23),
  no_rotation_hours_end: z.number().int().min(0).max(23),
  circuit_breaker_threshold: z.number().int().min(1).max(50),
  circuit_breaker_cooldown_minutes: z.number().int().min(1).max(1440),
});

const trackingSchema = z.object({
  meta_pixel_id: z.string().trim().max(64),
  meta_access_token: z.string().trim().max(512),
  meta_test_event_code: z.string().trim().max(64),
  tiktok_pixel_id: z.string().trim().max(64),
  tiktok_access_token: z.string().trim().max(512),
  tiktok_test_event_code: z.string().trim().max(64),
});

const timezoneSchema = z.object({
  business_timezone: z.string().min(2).max(64),
});

type RotationForm = z.infer<typeof rotationSchema>;
type TrackingForm = z.infer<typeof trackingSchema>;
type TimezoneForm = z.infer<typeof timezoneSchema>;

const DEFAULT_ROTATION: RotationForm = {
  enable_rotation: true,
  default_rotation_threshold: 847,
  default_cap_amount: 580,
  default_cap_window_days: 1,
  rotation_random_variance: 20,
  weekend_threshold_multiplier: 1.5,
  no_rotation_hours_start: 1,
  no_rotation_hours_end: 7,
  circuit_breaker_threshold: 5,
  circuit_breaker_cooldown_minutes: 15,
};

const DEFAULT_TRACKING: TrackingForm = {
  meta_pixel_id: "",
  meta_access_token: "",
  meta_test_event_code: "",
  tiktok_pixel_id: "",
  tiktok_access_token: "",
  tiktok_test_event_code: "",
};

// City -> IANA timezone (estendibile facilmente)
const CITY_TO_TZ: { city: string; tz: string }[] = [
  { city: "Roma (Italia)", tz: "Europe/Rome" },
  { city: "Milano (Italia)", tz: "Europe/Rome" },
  { city: "Londra (UK)", tz: "Europe/London" },
  { city: "Parigi (Francia)", tz: "Europe/Paris" },
  { city: "Madrid (Spagna)", tz: "Europe/Madrid" },
  { city: "Berlino (Germania)", tz: "Europe/Berlin" },
  { city: "Amsterdam (NL)", tz: "Europe/Amsterdam" },
  { city: "New York (USA)", tz: "America/New_York" },
  { city: "Los Angeles (USA)", tz: "America/Los_Angeles" },
  { city: "Tokyo (Giappone)", tz: "Asia/Tokyo" },
  { city: "Dubai (UAE)", tz: "Asia/Dubai" },
  { city: "Sydney (Australia)", tz: "Australia/Sydney" },
];

function detectAutoTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome";
  } catch {
    return "Europe/Rome";
  }
}

function formatNowInTz(tz: string): string {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: tz,
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date());
  } catch {
    return "—";
  }
}

function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [rotation, setRotation] = useState<RotationForm>(DEFAULT_ROTATION);
  const [tracking, setTracking] = useState<TrackingForm>(DEFAULT_TRACKING);
  const [timezone, setTimezone] = useState<TimezoneForm>({ business_timezone: "Europe/Rome" });
  const [autoTz, setAutoTz] = useState<string>("Europe/Rome");
  const [nowPreview, setNowPreview] = useState<string>("");
  const [checkoutFallbackImage, setCheckoutFallbackImage] = useState<string>("");
  const [geminiKey, setGeminiKey] = useState<string>("");
  const [geminiKeySet, setGeminiKeySet] = useState<boolean>(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const testGeminiFn = useServerFn(testGeminiApiKey);
  const chatGeminiFn = useServerFn(chatWithGemini);
  const getAiConfigFn = useServerFn(getAiConfig);

  // AI provider config
  const [aiProvider, setAiProvider] = useState<AiProvider>("gemini");
  const [aiModel, setAiModel] = useState<string>("gemini-2.5-flash");
  const [openrouterKey, setOpenrouterKey] = useState<string>("");
  const [openrouterKeySet, setOpenrouterKeySet] = useState<boolean>(false);
  const [lovableAvailable, setLovableAvailable] = useState<boolean>(false);

  const MODELS_BY_PROVIDER: Record<AiProvider, { value: string; label: string }[]> = {
    gemini: [
      { value: "gemini-2.5-flash", label: "gemini-2.5-flash (consigliato)" },
      { value: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite (economico)" },
      { value: "gemini-2.5-pro", label: "gemini-2.5-pro (qualità)" },
      { value: "gemini-2.0-flash", label: "gemini-2.0-flash" },
    ],
    lovable: [
      { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
      { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
      { value: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
      { value: "openai/gpt-5", label: "GPT-5" },
      { value: "openai/gpt-5-mini", label: "GPT-5 mini" },
      { value: "openai/gpt-5-nano", label: "GPT-5 nano" },
    ],
    openrouter: [
      { value: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini" },
      { value: "openai/gpt-4o", label: "openai/gpt-4o" },
      { value: "openai/gpt-4.1-mini", label: "openai/gpt-4.1-mini" },
      { value: "openai/gpt-4.1", label: "openai/gpt-4.1" },
      { value: "anthropic/claude-3.5-sonnet", label: "anthropic/claude-3.5-sonnet" },
      { value: "anthropic/claude-3.5-haiku", label: "anthropic/claude-3.5-haiku" },
      { value: "anthropic/claude-sonnet-4", label: "anthropic/claude-sonnet-4" },
      { value: "google/gemini-2.5-flash", label: "google/gemini-2.5-flash" },
      { value: "google/gemini-2.5-flash-lite", label: "google/gemini-2.5-flash-lite" },
      { value: "google/gemini-2.5-pro", label: "google/gemini-2.5-pro" },
      { value: "google/gemini-2.0-flash-001", label: "google/gemini-2.0-flash-001" },
      { value: "meta-llama/llama-3.3-70b-instruct", label: "meta-llama/llama-3.3-70b-instruct" },
      { value: "deepseek/deepseek-chat", label: "deepseek/deepseek-chat" },
      { value: "x-ai/grok-2-1212", label: "x-ai/grok-2-1212" },
    ],

  };

  type ChatMsg = { role: "user" | "model"; text: string; meta?: { durationMs?: number; finishReason?: string; source?: string } };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    const next: ChatMsg[] = [...chatMessages, { role: "user", text }];
    setChatMessages(next);
    setChatInput("");
    setChatSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const r = await chatGeminiFn({
        data: {
          accessToken,
          messages: next.map((m) => ({ role: m.role, text: m.text })),
        },
      });
      if (r.ok) {
        setChatMessages((prev) => [
          ...prev,
          { role: "model", text: r.reply || "(risposta vuota)", meta: { durationMs: r.durationMs, finishReason: r.finishReason, source: r.source } },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "model", text: `❌ ${r.message}`, meta: { durationMs: (r as any).durationMs, source: (r as any).source } },
        ]);
      }
    } catch (e) {
      setChatMessages((prev) => [...prev, { role: "model", text: `❌ ${(e as Error).message}` }]);
    } finally {
      setChatSending(false);
    }
  }

  async function load() {
    setLoading(true);
    const detected = detectAutoTimezone();
    setAutoTz(detected);
    const { data } = await supabase.from("settings").select("*");
    const map: Record<string, unknown> = {};
    for (const r of (data as { key: string; value: unknown }[]) || []) {
      map[r.key] = r.value;
    }
    const global = (map.global_config as Record<string, unknown>) || {};

    setRotation({
      ...DEFAULT_ROTATION,
      enable_rotation: (map.enable_rotation as boolean) ?? DEFAULT_ROTATION.enable_rotation,
      default_rotation_threshold: Number(global.default_rotation_threshold ?? DEFAULT_ROTATION.default_rotation_threshold),
      default_cap_amount: Number(global.default_cap_amount ?? DEFAULT_ROTATION.default_cap_amount),
      default_cap_window_days: Number(global.default_cap_window_days ?? DEFAULT_ROTATION.default_cap_window_days),
      rotation_random_variance: Number(map.rotation_random_variance ?? DEFAULT_ROTATION.rotation_random_variance),
      weekend_threshold_multiplier: Number(map.weekend_threshold_multiplier ?? DEFAULT_ROTATION.weekend_threshold_multiplier),
      no_rotation_hours_start: Number(map.no_rotation_hours_start ?? DEFAULT_ROTATION.no_rotation_hours_start),
      no_rotation_hours_end: Number(map.no_rotation_hours_end ?? DEFAULT_ROTATION.no_rotation_hours_end),
      circuit_breaker_threshold: Number(global.circuit_breaker_threshold ?? DEFAULT_ROTATION.circuit_breaker_threshold),
      circuit_breaker_cooldown_minutes: Number(global.circuit_breaker_cooldown_minutes ?? DEFAULT_ROTATION.circuit_breaker_cooldown_minutes),
    });

    setTracking({
      meta_pixel_id: String(map.meta_pixel_id ?? ""),
      meta_access_token: String(map.meta_access_token ?? ""),
      meta_test_event_code: String(map.meta_test_event_code ?? ""),
      tiktok_pixel_id: String(map.tiktok_pixel_id ?? ""),
      tiktok_access_token: String(map.tiktok_access_token ?? ""),
      tiktok_test_event_code: String(map.tiktok_test_event_code ?? ""),
    });

    const tzValue = (map.business_timezone as string) || detected || "Europe/Rome";
    setTimezone({ business_timezone: tzValue });
    setCheckoutFallbackImage((map.checkout_fallback_image as string) || "");
    const gk = map.gemini_api_key;
    const gkStr = typeof gk === "string" ? gk : (gk as any)?.key;
    setGeminiKeySet(!!(gkStr && String(gkStr).trim().length > 10));
    setGeminiKey("");
    const ork = map.openrouter_api_key;
    const orkStr = typeof ork === "string" ? ork : (ork as any)?.key;
    setOpenrouterKeySet(!!(orkStr && String(orkStr).trim().length > 10));
    setOpenrouterKey("");
    const aiCfg = (map.ai_config as any) || {};
    if (aiCfg.provider === "lovable" || aiCfg.provider === "openrouter" || aiCfg.provider === "gemini") {
      setAiProvider(aiCfg.provider);
    }
    if (typeof aiCfg.model === "string" && aiCfg.model) setAiModel(aiCfg.model);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const r = await getAiConfigFn({ data: { accessToken: sessionData.session?.access_token } });
      setLovableAvailable(!!r.lovableKeyAvailable);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Live preview clock (refresh every second)
  useEffect(() => {
    const tick = () => setNowPreview(formatNowInTz(timezone.business_timezone));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timezone.business_timezone]);

  const rotationErrors = useMemo(() => fieldErrors(rotationSchema, rotation), [rotation]);
  const trackingErrors = useMemo(() => fieldErrors(trackingSchema, tracking), [tracking]);

  async function saveRotation() {
    const parsed = rotationSchema.safeParse(rotation);
    if (!parsed.success) {
      toast.error("Correggi gli errori prima di salvare");
      return;
    }
    setSaving("rotation");
    try {
      const { data: existing } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "global_config")
        .maybeSingle();
      const current = (existing?.value as Record<string, unknown>) || {};
      const newGlobal = {
        ...current,
        default_rotation_threshold: parsed.data.default_rotation_threshold,
        default_cap_amount: parsed.data.default_cap_amount,
        default_cap_window_days: parsed.data.default_cap_window_days,
        circuit_breaker_threshold: parsed.data.circuit_breaker_threshold,
        circuit_breaker_cooldown_minutes: parsed.data.circuit_breaker_cooldown_minutes,
      };

      const upserts = [
        { key: "global_config", value: newGlobal as never, is_public: false },
        { key: "enable_rotation", value: parsed.data.enable_rotation as never, is_public: false },
        { key: "rotation_random_variance", value: parsed.data.rotation_random_variance as never, is_public: false },
        { key: "weekend_threshold_multiplier", value: parsed.data.weekend_threshold_multiplier as never, is_public: false },
        { key: "no_rotation_hours_start", value: parsed.data.no_rotation_hours_start as never, is_public: false },
        { key: "no_rotation_hours_end", value: parsed.data.no_rotation_hours_end as never, is_public: false },
      ];
      for (const u of upserts) {
        const { error } = await supabase.from("settings").upsert([u], { onConflict: "key" });
        if (error) throw error;
      }
      toast.success("Rotazione salvata");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function saveTracking() {
    const parsed = trackingSchema.safeParse(tracking);
    if (!parsed.success) {
      toast.error("Correggi gli errori prima di salvare");
      return;
    }
    setSaving("tracking");
    try {
      const upserts = Object.entries(parsed.data).map(([key, value]) => ({
        key,
        value: (value || "") as never,
        is_public: false,
      }));
      for (const u of upserts) {
        const { error } = await supabase.from("settings").upsert([u], { onConflict: "key" });
        if (error) throw error;
      }
      toast.success("Pixel & CAPI salvati");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function saveTimezone() {
    setSaving("timezone");
    try {
      const { error } = await supabase
        .from("settings")
        .upsert(
          [{ key: "business_timezone", value: timezone.business_timezone as never, is_public: true }],
          { onConflict: "key" },
        );
      if (error) throw error;
      toast.success("Fuso orario aggiornato");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function saveCheckoutFallback() {
    setSaving("checkout_fallback");
    try {
      const { error } = await supabase
        .from("settings")
        .upsert(
          [{ key: "checkout_fallback_image", value: (checkoutFallbackImage.trim() || null) as never, is_public: false }],
          { onConflict: "key" },
        );
      if (error) throw error;
      toast.success("Immagine checkout fallback salvata");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function saveGeminiKey() {
    const trimmed = geminiKey.trim();
    if (!trimmed) {
      toast.error("Incolla una chiave API valida");
      return;
    }
    setSaving("gemini");
    try {
      const { error } = await supabase
        .from("settings")
        .upsert(
          [{ key: "gemini_api_key", value: trimmed as never, is_public: false }],
          { onConflict: "key" },
        );
      if (error) throw error;
      toast.success("Chiave Gemini salvata. Le prossime traduzioni la useranno.");
      setGeminiKeySet(true);
      setGeminiKey("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function clearGeminiKey() {
    if (!confirm("Rimuovere la chiave Gemini? Le traduzioni verranno disattivate finché non ne configuri un'altra.")) return;
    setSaving("gemini");
    try {
      const { error } = await supabase.from("settings").delete().eq("key", "gemini_api_key");
      if (error) throw error;
      toast.success("Chiave Gemini rimossa");
      setGeminiKeySet(false);
      setGeminiKey("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function testGeminiKey() {
    setTestingGemini(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const r = await testGeminiFn({ data: { key: geminiKey.trim() || undefined, accessToken } });
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } catch (e) {
      toast.error((e as Error).message || "Test Gemini fallito");
    } finally {
      setTestingGemini(false);
    }
  }

  async function saveAiConfig() {
    setSaving("ai_config");
    try {
      const { error } = await supabase
        .from("settings")
        .upsert(
          [{ key: "ai_config", value: { provider: aiProvider, model: aiModel } as never, is_public: false }],
          { onConflict: "key" },
        );
      if (error) throw error;
      toast.success(`Provider AI impostato: ${aiProvider} · ${aiModel}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function saveOpenrouterKey() {
    const trimmed = openrouterKey.trim();
    if (!trimmed) {
      toast.error("Incolla una chiave OpenRouter valida");
      return;
    }
    setSaving("openrouter");
    try {
      const { error } = await supabase
        .from("settings")
        .upsert(
          [{ key: "openrouter_api_key", value: trimmed as never, is_public: false }],
          { onConflict: "key" },
        );
      if (error) throw error;
      toast.success("Chiave OpenRouter salvata.");
      setOpenrouterKeySet(true);
      setOpenrouterKey("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function clearOpenrouterKey() {
    if (!confirm("Rimuovere la chiave OpenRouter?")) return;
    setSaving("openrouter");
    try {
      const { error } = await supabase.from("settings").delete().eq("key", "openrouter_api_key");
      if (error) throw error;
      toast.success("Chiave OpenRouter rimossa");
      setOpenrouterKeySet(false);
      setOpenrouterKey("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  function onProviderChange(p: AiProvider) {
    setAiProvider(p);
    const first = MODELS_BY_PROVIDER[p][0]?.value;
    if (first) setAiModel(first);
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground">Configurazione globale, tracking e fuso orario.</p>
      </div>

      {/* TIMEZONE */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="h-4 w-4" />
            Fuso orario
          </CardTitle>
          <CardDescription>
            Usato per calcolare il "giorno corrente" delle vendite e dei cap rotazione.
            Auto-rilevato dal tuo browser, modificabile selezionando una città.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
            <Label className="pt-2">Città / fuso</Label>
            <div className="space-y-2 max-w-md">
              <Select
                value={timezone.business_timezone}
                onValueChange={(v) => setTimezone({ business_timezone: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CITY_TO_TZ.map((c) => (
                    <SelectItem key={c.city} value={c.tz}>
                      {c.city} <span className="text-muted-foreground text-xs ml-1">({c.tz})</span>
                    </SelectItem>
                  ))}
                  {!CITY_TO_TZ.some((c) => c.tz === timezone.business_timezone) && (
                    <SelectItem value={timezone.business_timezone}>
                      {timezone.business_timezone}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Ora corrente: <strong className="text-foreground tabular-nums">{nowPreview}</strong>
                </span>
                {autoTz && autoTz !== timezone.business_timezone && (
                  <button
                    onClick={() => setTimezone({ business_timezone: autoTz })}
                    className="underline hover:text-foreground"
                  >
                    Usa {autoTz}
                  </button>
                )}
              </div>
            </div>
          </div>
          <SaveButton
            saving={saving === "timezone"}
            disabled={false}
            onClick={saveTimezone}
            errorCount={0}
          />
        </CardContent>
      </Card>

      {/* TRACKING PIXELS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Tracking · Meta CAPI & TikTok Events API
          </CardTitle>
          <CardDescription>
            Pixel ID + Access Token per inviare eventi server-side (ViewContent, AddToCart,
            InitiateCheckout, Purchase). La conversione viene anche firata server-side dal
            webhook ordine, con dedup tramite event_id (compatibile iOS 14.5+).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Meta (Facebook / Instagram)</h4>
            <FieldText
              label="Pixel ID"
              value={tracking.meta_pixel_id}
              onChange={(v) => setTracking((t) => ({ ...t, meta_pixel_id: v }))}
              placeholder="es. 123456789012345"
            />
            <FieldText
              label="Access Token (CAPI)"
              value={tracking.meta_access_token}
              onChange={(v) => setTracking((t) => ({ ...t, meta_access_token: v }))}
              placeholder="EAAB..."
              type="password"
            />
            <FieldText
              label="Test Event Code (opz.)"
              value={tracking.meta_test_event_code}
              onChange={(v) => setTracking((t) => ({ ...t, meta_test_event_code: v }))}
              placeholder="TEST12345"
            />
          </div>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">TikTok</h4>
            <FieldText
              label="Pixel ID"
              value={tracking.tiktok_pixel_id}
              onChange={(v) => setTracking((t) => ({ ...t, tiktok_pixel_id: v }))}
              placeholder="es. C2HFMJBC77U..."
            />
            <FieldText
              label="Access Token (Events API)"
              value={tracking.tiktok_access_token}
              onChange={(v) => setTracking((t) => ({ ...t, tiktok_access_token: v }))}
              type="password"
            />
            <FieldText
              label="Test Event Code (opz.)"
              value={tracking.tiktok_test_event_code}
              onChange={(v) => setTracking((t) => ({ ...t, tiktok_test_event_code: v }))}
            />
          </div>
          <SaveButton
            saving={saving === "tracking"}
            disabled={Object.keys(trackingErrors).length > 0}
            onClick={saveTracking}
            errorCount={Object.keys(trackingErrors).length}
          />
        </CardContent>
      </Card>

      {/* ROTATION */}
      <Card>
        <CardHeader>
          <CardTitle>Rotazione & circuit breaker</CardTitle>
          <CardDescription>Soglie default e regole di failover per gli store.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="Rotazione attiva">
            <Switch
              checked={rotation.enable_rotation}
              onCheckedChange={(v) => setRotation((r) => ({ ...r, enable_rotation: v }))}
            />
          </Row>
          <Separator />
          <NumberField
            label="Soglia rotazione default (€)"
            value={rotation.default_rotation_threshold}
            onChange={(v) => setRotation((r) => ({ ...r, default_rotation_threshold: v }))}
            error={rotationErrors.default_rotation_threshold}
            help="Revenue al raggiungimento del quale lo store ruota."
          />
          <NumberField
            label="Cap importo default (€)"
            value={rotation.default_cap_amount}
            onChange={(v) => setRotation((r) => ({ ...r, default_cap_amount: v }))}
            error={rotationErrors.default_cap_amount}
          />
          <NumberField
            label="Finestra cap (giorni)"
            value={rotation.default_cap_window_days}
            onChange={(v) => setRotation((r) => ({ ...r, default_cap_window_days: v }))}
            error={rotationErrors.default_cap_window_days}
          />
          <NumberField
            label="Variance soglia (%)"
            value={rotation.rotation_random_variance}
            onChange={(v) => setRotation((r) => ({ ...r, rotation_random_variance: v }))}
            error={rotationErrors.rotation_random_variance}
            help="Jitter applicato alla soglia per evitare pattern."
          />
          <NumberField
            label="Moltiplicatore weekend"
            value={rotation.weekend_threshold_multiplier}
            onChange={(v) => setRotation((r) => ({ ...r, weekend_threshold_multiplier: v }))}
            error={rotationErrors.weekend_threshold_multiplier}
            step={0.1}
          />
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Blackout start (h locale)"
              value={rotation.no_rotation_hours_start}
              onChange={(v) => setRotation((r) => ({ ...r, no_rotation_hours_start: v }))}
              error={rotationErrors.no_rotation_hours_start}
            />
            <NumberField
              label="Blackout end (h locale)"
              value={rotation.no_rotation_hours_end}
              onChange={(v) => setRotation((r) => ({ ...r, no_rotation_hours_end: v }))}
              error={rotationErrors.no_rotation_hours_end}
            />
          </div>
          <Separator />
          <NumberField
            label="Circuit breaker · soglia errori"
            value={rotation.circuit_breaker_threshold}
            onChange={(v) => setRotation((r) => ({ ...r, circuit_breaker_threshold: v }))}
            error={rotationErrors.circuit_breaker_threshold}
            help="Errori consecutivi prima di marcare lo store offline."
          />
          <NumberField
            label="Circuit breaker · cooldown (min)"
            value={rotation.circuit_breaker_cooldown_minutes}
            onChange={(v) => setRotation((r) => ({ ...r, circuit_breaker_cooldown_minutes: v }))}
            error={rotationErrors.circuit_breaker_cooldown_minutes}
          />
          <SaveButton
            saving={saving === "rotation"}
            disabled={Object.keys(rotationErrors).length > 0}
            onClick={saveRotation}
            errorCount={Object.keys(rotationErrors).length}
          />
        </CardContent>
      </Card>

      {/* AI PROVIDER SELECTION */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Provider AI per traduzioni
          </CardTitle>
          <CardDescription>
            Scegli quale AI usare per tradurre prodotti, footer, branding e pagine legali.
            La configurazione si applica immediatamente al click su "Salva provider".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={aiProvider} onValueChange={(v) => onProviderChange(v as AiProvider)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Google Gemini (chiave personale)</SelectItem>
                  <SelectItem value="lovable">Lovable AI Gateway {lovableAvailable ? "✓" : "(non configurato)"}</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {aiProvider === "gemini" && "Usa la chiave Gemini configurata qui sotto."}
                {aiProvider === "lovable" && (lovableAvailable
                  ? "Usa il gateway Lovable AI (LOVABLE_API_KEY già configurata sul server)."
                  : "LOVABLE_API_KEY non disponibile sul server — non utilizzabile.")}
                {aiProvider === "openrouter" && "Richiede una chiave OpenRouter (configurala qui sotto)."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Modello</Label>
              <Select value={aiModel} onValueChange={setAiModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODELS_BY_PROVIDER[aiProvider].map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Modelli disponibili per {aiProvider}.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveAiConfig} disabled={saving === "ai_config"}>
              {saving === "ai_config" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salva provider
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* OPENROUTER API KEY */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            OpenRouter API Key
          </CardTitle>
          <CardDescription>
            Chiave API di <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">openrouter.ai <ExternalLink className="h-3 w-3" /></a>.
            Permette di usare GPT-4o, Claude, Llama, DeepSeek e altri modelli con un'unica chiave.
            Necessaria solo se selezioni "OpenRouter" come provider sopra.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldText
            label="OpenRouter API Key"
            value={openrouterKey}
            onChange={setOpenrouterKey}
            type="password"
            placeholder={openrouterKeySet ? "•••••••••••••• (chiave salvata — incolla per sostituire)" : "sk-or-v1-..."}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs">
              {openrouterKeySet ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Chiave OpenRouter attiva
                </span>
              ) : (
                <span className="text-muted-foreground">Nessuna chiave OpenRouter salvata</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {openrouterKeySet && (
                <Button variant="ghost" size="sm" onClick={clearOpenrouterKey} disabled={saving === "openrouter"}>
                  Rimuovi
                </Button>
              )}
              <Button onClick={saveOpenrouterKey} disabled={saving === "openrouter" || !openrouterKey.trim()}>
                {saving === "openrouter" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salva chiave
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI TRADUZIONI · GEMINI API */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Traduzioni · Google Gemini
          </CardTitle>
          <CardDescription>
            Incolla qui la <strong>tua chiave API personale</strong> di Google AI Studio per usarla al posto del gateway Lovable.
            Le traduzioni di prodotti, footer, branding e pagine legali useranno automaticamente questa chiave.
            La chiave è salvata lato server e accessibile solo agli admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1.5 text-muted-foreground">
            <p className="font-medium text-foreground">Come ottenere la chiave Gemini:</p>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Vai su <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1 text-foreground">Google AI Studio <ExternalLink className="h-3 w-3" /></a></li>
              <li>Clicca <strong>"Create API key"</strong> e copia la chiave (formato <code>AIza…</code>)</li>
              <li>Incollala qui sotto e salva</li>
              <li>Vai in <a href="/admin/products" className="underline text-foreground">Prodotti</a> e clicca <strong>"Rigenera traduzioni"</strong></li>
            </ol>
          </div>

          <FieldText
            label="Gemini API Key"
            value={geminiKey}
            onChange={setGeminiKey}
            type="password"
            placeholder={geminiKeySet ? "•••••••••••••• (chiave salvata — incolla per sostituire)" : "AIza..."}
          />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs">
              {geminiKeySet ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Chiave attiva — modello <code>gemini-2.5-flash</code>
                </span>
              ) : (
                <span className="text-muted-foreground">Nessuna chiave salvata · uso del gateway Lovable AI di default</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {geminiKeySet && (
                <Button variant="ghost" size="sm" onClick={clearGeminiKey} disabled={saving === "gemini"}>
                  Rimuovi
                </Button>
              )}
              <Button variant="outline" onClick={testGeminiKey} disabled={testingGemini || (!geminiKeySet && !geminiKey.trim())}>
                {testingGemini ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Test API
              </Button>
              <Button onClick={saveGeminiKey} disabled={saving === "gemini" || !geminiKey.trim()}>
                {saving === "gemini" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salva chiave
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CHAT GEMINI · TEST API DIRETTAMENTE DAL CRM */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat con Gemini
          </CardTitle>
          <CardDescription>
            Chatta direttamente con l'API Gemini configurata sopra per verificare in tempo reale
            che la connessione al CRM funzioni. Modello: <code>gemini-2.5-flash</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-border bg-muted/20 p-3 max-h-[420px] overflow-y-auto space-y-3">
            {chatMessages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                Nessun messaggio. Scrivi qualcosa qui sotto per testare l'API.
              </p>
            ) : (
              chatMessages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "model" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border border-border"}`}>
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    {m.meta && (m.meta.durationMs || m.meta.source) && (
                      <div className="mt-1 text-[10px] opacity-70">
                        {m.meta.source && <span>src: {m.meta.source}</span>}
                        {m.meta.durationMs !== undefined && <span> · {m.meta.durationMs}ms</span>}
                        {m.meta.finishReason && <span> · {m.meta.finishReason}</span>}
                      </div>
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                      <UserIcon className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))
            )}
            {chatSending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Gemini sta rispondendo…
              </div>
            )}
          </div>
          <div className="flex gap-2 items-end">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChat();
                }
              }}
              placeholder="Scrivi un messaggio… (Invio per inviare, Shift+Invio per a capo)"
              rows={2}
              className="resize-none"
            />
            <div className="flex flex-col gap-2">
              <Button onClick={sendChat} disabled={chatSending || !chatInput.trim()}>
                {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
              {chatMessages.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setChatMessages([])} disabled={chatSending}>
                  Pulisci
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CHECKOUT FALLBACK IMAGE */}
      <Card>
        <CardHeader>
          <CardTitle>Immagine checkout fallback</CardTitle>
          <CardDescription>
            URL immagine generica usata quando il prodotto non ha un'immagine checkout dedicata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <input
              type="url"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="https://..."
              value={checkoutFallbackImage}
              onChange={(e) => setCheckoutFallbackImage(e.target.value)}
            />
            {checkoutFallbackImage && (
              <img
                src={checkoutFallbackImage}
                alt="anteprima fallback"
                className="h-24 w-24 rounded border border-border object-cover"
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            )}
          </div>
          <SaveButton
            saving={saving === "checkout_fallback"}
            disabled={false}
            onClick={saveCheckoutFallback}
            errorCount={0}
          />
        </CardContent>
      </Card>

      <CloudflareDeployCard />
      <DatabaseBackupCard />

    </div>
  );
}

// ========== helpers ==========

function fieldErrors<T>(schema: z.ZodType<T>, data: T): Record<string, string> {
  const result = schema.safeParse(data);
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label>{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function NumberField({
  label, value, onChange, error, help, step,
}: {
  label: string; value: number; onChange: (v: number) => void;
  error?: string; help?: string; step?: number;
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-2">
        <Label>{label}</Label>
        {help && <p className="text-xs text-muted-foreground mt-1">{help}</p>}
      </div>
      <div className="space-y-1 max-w-xs">
        <Input
          type="number"
          step={step ?? 1}
          value={value === null || value === undefined || Number.isNaN(value) ? "" : value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={error ? "border-destructive" : ""}
        />
        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}

function FieldText({
  label, value, onChange, error, placeholder, type, autoComplete,
}: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; type?: string; autoComplete?: string;
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <Label className="pt-2">{label}</Label>
      <div className="space-y-1 max-w-md">
        <Input
          type={type ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete ?? "off"}
          className={error ? "border-destructive" : ""}
        />
        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}

function SaveButton({
  saving, disabled, onClick, errorCount,
}: {
  saving: boolean; disabled: boolean; onClick: () => void; errorCount: number;
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <Button onClick={onClick} disabled={saving || disabled}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Salva
      </Button>
      {errorCount > 0 ? (
        <span className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {errorCount} {errorCount === 1 ? "errore" : "errori"}
        </span>
      ) : (
        <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> valido
        </span>
      )}
    </div>
  );
}

// ========== Cloudflare deployment env vars ==========

const CLOUDFLARE_ENV_VARS: {
  name: string;
  scope: "Variable" | "Secret";
  required: boolean;
  value?: string;
  description: string;
}[] = [
  {
    name: "VITE_SUPABASE_URL",
    scope: "Variable",
    required: true,
    value: import.meta.env.VITE_SUPABASE_URL as string,
    description: "URL pubblico del backend Supabase (build-time, esposto al browser).",
  },
  {
    name: "VITE_SUPABASE_PUBLISHABLE_KEY",
    scope: "Variable",
    required: true,
    value: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    description: "Anon/publishable key (build-time, esposto al browser — è sicuro).",
  },
  {
    name: "VITE_SUPABASE_PROJECT_ID",
    scope: "Variable",
    required: true,
    value: import.meta.env.VITE_SUPABASE_PROJECT_ID as string,
    description: "Project ref Supabase (build-time).",
  },
  {
    name: "SUPABASE_URL",
    scope: "Variable",
    required: true,
    value: import.meta.env.VITE_SUPABASE_URL as string,
    description: "Stessa URL Supabase, usata dal runtime server (SSR / server functions).",
  },
  {
    name: "SUPABASE_PUBLISHABLE_KEY",
    scope: "Variable",
    required: true,
    value: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    description: "Anon key per il runtime server (auth middleware).",
  },
  {
    name: "SUPABASE_ANON_KEY",
    scope: "Variable",
    required: true,
    value: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    description: "Alias anon key usato da alcune edge functions.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    scope: "Secret",
    required: true,
    description: "Service role key (bypassa RLS). SECRET — prendila da Supabase → Settings → API.",
  },
  {
    name: "SUPABASE_JWKS",
    scope: "Secret",
    required: false,
    description: "JWKS per verificare i JWT lato server (opzionale, usato da auth middleware).",
  },
  {
    name: "LOVABLE_API_KEY",
    scope: "Secret",
    required: false,
    description: "Chiave Lovable AI Gateway (traduzioni, chat AI). Solo se usi le funzioni AI.",
  },
  {
    name: "HAPPYSCAM_ENCRYPTION_KEY",
    scope: "Secret",
    required: false,
    description: "Chiave legacy per decifrare bridge_api_key (solo se hai dati storici cifrati v1:).",
  },
];

function CloudflareDeployCard() {
  const [showSecrets, setShowSecrets] = useState(false);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copiato: ${label}`);
  };

  const copyAllEnv = () => {
    const lines = CLOUDFLARE_ENV_VARS
      .filter((v) => v.value)
      .map((v) => `${v.name}=${v.value}`)
      .join("\n");
    navigator.clipboard.writeText(lines);
    toast.success("Variabili pubbliche copiate in formato .env");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="h-4 w-4" /> Deploy su Cloudflare Pages / Workers
        </CardTitle>
        <CardDescription>
          Tutte le variabili d'ambiente da configurare in <strong>Cloudflare → Workers & Pages → tuo
          progetto → Settings → Variables and Secrets</strong>. Le <em>Variables</em> sono pubbliche
          (visibili nel bundle), i <em>Secrets</em> sono cifrati e disponibili solo a runtime server.
          Imposta entrambi gli ambienti <strong>Production</strong> e <strong>Preview</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copyAllEnv}>
            Copia tutte le pubbliche (.env)
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowSecrets((s) => !s)}>
            {showSecrets ? "Nascondi" : "Mostra"} valori pubblici
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a
              href="https://dash.cloudflare.com/?to=/:account/workers-and-pages"
              target="_blank"
              rel="noreferrer"
            >
              Apri Cloudflare <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        </div>

        <div className="rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Valore</th>
                <th className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {CLOUDFLARE_ENV_VARS.map((v) => (
                <tr key={v.name} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-mono text-xs">
                    {v.name}
                    {v.required && <span className="ml-1 text-destructive">*</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        v.scope === "Secret"
                          ? "rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
                          : "rounded bg-primary/10 px-2 py-0.5 text-xs text-primary"
                      }
                    >
                      {v.scope}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {v.value ? (
                      <div className="flex items-center gap-2">
                        <code className="max-w-[280px] truncate rounded bg-muted px-2 py-0.5 text-xs">
                          {showSecrets ? v.value : v.value.slice(0, 12) + "…"}
                        </code>
                        <Button size="sm" variant="ghost" onClick={() => copy(v.value!, v.name)}>
                          Copia
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {v.scope === "Secret" ? "(da impostare manualmente)" : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{v.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <strong>⚠️ Build & Deploy command (IMPORTANTE):</strong>
          <p className="mt-1">
            Il <code>wrangler.jsonc</code> alla root punta a <code>src/server.ts</code> (per dev). Per il
            deploy reale devi usare il <code>wrangler.json</code> generato da <code>vite build</code> in
            <code> dist/server/</code>, altrimenti fallisce con
            <code> Could not resolve "tanstack-start-manifest:v"</code>.
          </p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-background p-2">
{`# Cloudflare → Workers & Pages → Settings → Builds

# Build command:
npm run build

# Deploy command (DEVE puntare al config generato):
npx wrangler deploy --config dist/server/wrangler.json

# oppure tutto in uno (script già nel package.json):
npm run deploy`}
          </pre>
          <p className="mt-2">
            Lo script <code>npm run deploy</code> esegue
            <code> vite build &amp;&amp; wrangler deploy --config dist/server/wrangler.json</code>.
          </p>
        </div>



        <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong>Comando Wrangler per i secrets (una tantum):</strong>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">
{`wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put LOVABLE_API_KEY
wrangler secret put SUPABASE_JWKS
wrangler secret put HAPPYSCAM_ENCRYPTION_KEY`}
          </pre>
          Le <code>VITE_*</code> vanno nel <strong>build environment</strong> (Settings → Build →
          Environment variables) perché vengono inlineate al build. <code>SUPABASE_*</code> server
          vanno come <strong>runtime</strong> variables/secrets sul Worker/Pages function.
        </div>
      </CardContent>
    </Card>
  );
}



const BACKUP_TABLES = [
  "products", "categories", "stores", "store_stats", "processed_orders",
  "webhook_events", "webhook_log", "sessions", "bot_blocks", "ab_tests", "ab_test_events",
  "utm_campaigns", "customers", "site_branding", "footer_config", "company_info",
  "home_sections", "legal_pages", "settings", "translations", "translation_failures",
  "integrations", "tracking_events", "shadow_checkout_log", "shopify_oauth_logs",
  "shopify_variant_map", "rotation_log", "sync_log", "system_logs", "team_members",
  "user_roles", "variant_cache",
];

function DatabaseBackupCard() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const exportFn = useServerFn(exportFullBackup);

  async function exportAll() {
    setExporting(true);
    try {
      const dump: any = await exportFn({});
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `database-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const tableRows = Object.values(dump.tables || {}).reduce((a: number, r: any) => a + (Array.isArray(r) ? r.length : 0), 0);
      const users = Array.isArray(dump.auth_users) ? dump.auth_users.length : 0;
      const secrets = dump.secrets ? Object.keys(dump.secrets).length : 0;
      toast.success(`Backup completo: ${tableRows} righe DB · ${users} utenti · ${secrets} chiavi/secrets`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }


  async function importAll(file: File) {
    if (!confirm("ATTENZIONE: questo sovrascriverà i dati esistenti nelle tabelle del backup. Continuare?")) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const tables: Record<string, unknown[]> = parsed.tables || parsed;
      let totalIns = 0;
      const errors: string[] = [];
      for (const t of BACKUP_TABLES) {
        const rows = tables[t];
        if (!Array.isArray(rows) || !rows.length) continue;
        const CHUNK = 200;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const slice = rows.slice(i, i + CHUNK);
          const { error } = await supabase.from(t as never).upsert(slice as never, { onConflict: "id" });
          if (error) {
            errors.push(`${t}: ${error.message}`);
            break;
          }
          totalIns += slice.length;
        }
      }
      if (errors.length) toast.warning(`Import parziale: ${totalIns} righe. Errori: ${errors.slice(0, 3).join(" · ")}`);
      else toast.success(`Importate ${totalIns} righe`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup database completo</CardTitle>
        <CardDescription>
          Esporta o importa <strong>tutto</strong>: tabelle (prodotti, ordini, traduzioni, branding, settings…), utenti auth e <strong>tutte le API key / secrets</strong> (Lovable, Gemini, Supabase, Shopify, ecc.) in un singolo file JSON.
          L'import esegue un upsert per id: i record esistenti verranno aggiornati. I secrets vanno ripristinati manualmente dalle impostazioni Cloud.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={exportAll} disabled={exporting}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Esporta tutto
        </Button>
        <Button variant="outline" asChild disabled={importing}>
          <label className="cursor-pointer">
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Importa backup
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importAll(f);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
      </CardContent>
    </Card>
  );
}
