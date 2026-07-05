import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { bridgeHandshake } from "@/lib/bridge.functions";
import { Wizard, type WizardStep } from "@/components/admin/Wizard";
import { Boxes, ShoppingBag, Copy, RefreshCw, KeyRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type IntegrationType = "native_bridge" | "shopify";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v.trim());

function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateBridgeKey(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return "bk_" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isUsableUrl(value: string | undefined | null): value is string {
  const v = value?.trim();
  return !!v && v !== "undefined" && v !== "null";
}
function getFunctionsBaseUrl(): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/$/, "");
  return isUsableUrl(supabaseUrl) ? `${supabaseUrl}/functions/v1` : "";
}
function getBridgeCallbackUrl(): string {
  const configured = (import.meta.env.VITE_SITE_A_PUBLIC_URL as string | undefined)?.trim().replace(/\/$/, "");
  const origin = isUsableUrl(configured)
    ? configured
    : typeof window !== "undefined" && isUsableUrl(window.location.origin)
      ? window.location.origin.replace(/\/$/, "")
      : "";
  const fns = getFunctionsBaseUrl();
  if (isUsableUrl(fns)) return `${fns}/bridge-callback`;
  return origin ? `${origin}/api/public/bridge/callback` : "/api/public/bridge/callback";
}

/** Wizard "Nuovo store" (solo creazione) per admin/stores del Sito A. */
export default function AddStoreWizard({
  onSaved,
  onCancel,
}: {
  onSaved: () => void;
  onCancel: () => void;
}) {
  const bridgeHandshakeFn = useServerFn(bridgeHandshake);

  const [integrationType, setIntegrationType] = useState<IntegrationType>("native_bridge");
  const [displayName, setDisplayName] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [storeId, setStoreId] = useState("");
  const [bridgeSiteUrl, setBridgeSiteUrl] = useState("");
  const [bridgeApiKey, setBridgeApiKey] = useState("");
  const [confirmedOnB, setConfirmedOnB] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ stage: string; message: string } | null>(null);

  const callbackUrl = useMemo(() => getBridgeCallbackUrl(), []);

  // Genera un UUID all'apertura (rigenerabile).
  useEffect(() => {
    setStoreId((v) => v || newUuid());
  }, []);

  const isNative = integrationType === "native_bridge";
  const domainValid = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shopDomain.trim());

  function copy(text: string, label = "Copiato") {
    navigator.clipboard.writeText(text).then(
      () => toast.success(label),
      () => toast.error("Copia non riuscita"),
    );
  }

  async function handleSave() {
    setError(null);
    // Validazioni
    if (isNative) {
      if (!displayName.trim()) {
        // Bridge Name è facoltativo: nessun blocco.
      }
    } else if (!domainValid) {
      setError({ stage: "validation", message: "Shop domain deve terminare in .myshopify.com" });
      return;
    }
    if (!isUuid(storeId)) {
      setError({ stage: "validation", message: "site_a_store_id non è un UUID valido" });
      return;
    }
    if (!bridgeSiteUrl.trim()) {
      setError({ stage: "validation", message: "URL Sito Ponte obbligatorio" });
      return;
    }
    if (!bridgeApiKey.trim()) {
      setError({ stage: "validation", message: "Bridge API Key obbligatoria" });
      return;
    }

    setSubmitting(true);
    try {
      const id = storeId.trim();
      // shop_domain è UNIQUE/NOT NULL: per il nativo generiamo un dominio sintetico dall'UUID.
      const domain = isNative ? `native-${id.slice(0, 8)}.bridge` : shopDomain.trim().toLowerCase();

      // Pre-check duplicato shop_domain → errore parlante.
      const { data: existing } = await supabase
        .from("stores")
        .select("id, shop_domain, is_active, bridge_status")
        .eq("shop_domain", domain)
        .maybeSingle();
      if (existing) {
        throw stage(
          "duplicate-domain",
          `Esiste già uno store con domain "${domain}" (id ${(existing as { id: string }).id}). Usa "Modifica" oppure cambia i dati.`,
        );
      }

      let normUrl = bridgeSiteUrl.trim().replace(/\/$/, "");
      if (normUrl && !/^https?:\/\//i.test(normUrl)) normUrl = `https://${normUrl}`;

      const insertPayload = {
        id,
        integration_type: integrationType,
        shop_domain: domain,
        display_name: displayName.trim() || null,
        country_rule: "ALL",
        cap_amount: 580,
        cap_window_days: 1,
        rotation_threshold: 847,
        bridge_site_url: normUrl,
        bridge_api_key_encrypted: bridgeApiKey.trim(),
        bridge_status: "registering",
        is_active: true,
      };

      const { data: inserted, error: insErr } = await supabase
        .from("stores")
        .insert(insertPayload as never)
        .select("id")
        .single();
      if (insErr) {
        const code = (insErr as { code?: string }).code;
        let friendly = insErr.message;
        if (code === "23505" && /shop_domain/.test(insErr.message)) {
          friendly = `Domain "${domain}" già usato da un altro store.`;
        }
        throw stage("insert", `[${code || "?"}] ${friendly}`);
      }
      const createdId = (inserted as { id: string } | null)?.id ?? id;
      toast.success("Store creato — registrazione su Sito B in corso…");

      // 1) Registrazione su Sito B
      try {
        const { data: regData, error: regErr } = await supabase.functions.invoke<{
          ok?: boolean;
          error?: string;
          http_status?: number;
          authorize_url?: string;
        }>("bridge-register-store", { body: { store_id: createdId } });
        if (regErr) throw new Error(regErr.message || "Errore di rete verso Sito B");
        if (!regData?.ok) throw new Error(regData?.error || `Sito B HTTP ${regData?.http_status ?? "?"}`);
        toast.success("Sito B ha registrato lo store");
        if (regData?.authorize_url) {
          window.open(regData.authorize_url, "_blank", "noopener,noreferrer");
        }
      } catch (e) {
        setError({ stage: "bridge-register", message: (e as Error).message });
        toast.error(`Registrazione su Sito B fallita: ${(e as Error).message}`, { duration: 10000 });
      }

      // 2) Handshake automatico verso il Sito B
      try {
        const hs = await bridgeHandshakeFn({ data: { store_id: createdId } });
        if (hs?.ok) toast.success("Handshake con Sito B riuscito");
        else toast.warning(`Handshake non riuscito: ${hs?.error ?? "errore"} — riprova da "Verifica Bridge"`);
      } catch (e) {
        toast.warning(`Handshake non riuscito: ${(e as Error).message}`);
      }

      onSaved();
    } catch (e) {
      const err = e as { stage?: string; message: string };
      setError({ stage: err.stage ?? "exception", message: err.message });
      toast.error(err.message, { duration: 12000 });
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- definizione step ----------
  const steps: WizardStep[] = [
    {
      title: "Tipo integrazione",
      description: "Come viene gestito il checkout di questo store.",
      hideNav: true,
      content: ({ next }) => (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                value: "native_bridge",
                title: "Checkout nativo Sito B",
                desc: "Pagamento gestito dal Sito B (Whop). Nessun dominio .myshopify.com richiesto.",
                icon: <Boxes className="h-5 w-5" />,
              },
              {
                value: "shopify",
                title: "Shopify",
                desc: "Integrazione Shopify classica via Sito Ponte. Richiede dominio .myshopify.com.",
                icon: <ShoppingBag className="h-5 w-5" />,
              },
            ] as { value: IntegrationType; title: string; desc: string; icon: React.ReactNode }[]
          ).map((opt) => {
            const selected = integrationType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setIntegrationType(opt.value);
                  next();
                }}
                className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition ${
                  selected ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
                  {opt.icon}
                </span>
                <span className="text-sm font-medium">{opt.title}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      ),
    },
    isNative
      ? {
          title: "Bridge Name",
          description: "Nome interno per riconoscere lo store (facoltativo).",
          valid: true,
          content: (
            <LabeledField label="Bridge Name (facoltativo)">
              <Input
                placeholder="Es. Acme Store IT"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </LabeledField>
          ),
        }
      : {
          title: "Shop domain",
          description: "Dominio Shopify dello store. Deve terminare in .myshopify.com.",
          valid: domainValid,
          content: (
            <LabeledField
              label="Shop domain *"
              error={shopDomain && !domainValid ? "Deve terminare in .myshopify.com" : undefined}
            >
              <Input
                placeholder="mio-store.myshopify.com"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value.trim().toLowerCase())}
              />
            </LabeledField>
          ),
        },
    {
      title: "site_a_store_id (UUID)",
      description: "Identificatore univoco dello store. Copialo: ti servirà sul Sito B.",
      valid: isUuid(storeId),
      content: ({ next }) => (
        <LabeledField
          label="site_a_store_id"
          error={storeId && !isUuid(storeId) ? "UUID non valido" : undefined}
        >
          <Input value={storeId} onChange={(e) => setStoreId(e.target.value.trim())} className="font-mono text-xs" />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!isUuid(storeId)) {
                  toast.error("UUID non valido");
                  return;
                }
                copy(storeId, "UUID copiato");
                next();
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copia e continua
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setStoreId(newUuid());
                toast.success("Nuovo UUID generato");
              }}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Rigenera
            </Button>
          </div>
        </LabeledField>
      ),
    },
    {
      title: "URL Sito Ponte",
      description: "BRIDGE_SITE_URL: l'URL pubblico del Sito Ponte (Sito B).",
      valid: bridgeSiteUrl.trim().length > 0,
      content: ({ next }) => (
        <LabeledField label="BRIDGE_SITE_URL *">
          <Input
            placeholder="whop-seo-back-01.workers.dev"
            value={bridgeSiteUrl}
            onChange={(e) => setBridgeSiteUrl(e.target.value)}
            className="font-mono text-xs"
          />
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                let v = bridgeSiteUrl.trim().replace(/\/$/, "");
                if (v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
                if (!v) {
                  toast.error("Inserisci l'URL del Sito Ponte");
                  return;
                }
                setBridgeSiteUrl(v);
                copy(v, "URL copiato");
                next();
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copia e continua
            </Button>
          </div>
        </LabeledField>
      ),
    },
    {
      title: "Bridge API Key",
      description: "Chiave condivisa Sito A ↔ Sito B. Generala e incollala anche sul Sito B.",
      valid: bridgeApiKey.trim().length > 0,
      content: ({ next }) => (
        <LabeledField label="Bridge API Key *">
          <Input value={bridgeApiKey} onChange={(e) => setBridgeApiKey(e.target.value.trim())} className="font-mono text-xs" placeholder="bk_…" />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setBridgeApiKey(generateBridgeKey());
                toast.success("Nuova API Key generata");
              }}
            >
              <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Genera
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!bridgeApiKey.trim()) {
                  toast.error("Genera o incolla una API Key");
                  return;
                }
                copy(bridgeApiKey, "API Key copiata");
                next();
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copia e continua
            </Button>
          </div>
        </LabeledField>
      ),
    },
    {
      title: "Callback URL (Sito A)",
      description: "URL su cui il Sito B invierà gli eventi. Incollalo nel Sito B.",
      valid: true,
      content: ({ next }) => (
        <LabeledField label="Callback URL">
          <Input readOnly value={callbackUrl} className="bg-muted/40 font-mono text-xs" />
          <div className="mt-2">
            <Button type="button" size="sm" onClick={() => { copy(callbackUrl, "Callback URL copiato"); next(); }}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copia e continua
            </Button>
          </div>
        </LabeledField>
      ),
    },
    {
      title: "Riepilogo",
      description: "Controlla i dati prima di procedere.",
      valid: true,
      content: (
        <dl className="grid gap-x-6 gap-y-2 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
          <Row k="Tipo" v={isNative ? "Checkout nativo Sito B" : "Shopify"} />
          <Row k={isNative ? "Bridge Name" : "Shop domain"} v={(isNative ? displayName : shopDomain) || "—"} mono={!isNative} />
          <Row k="site_a_store_id" v={storeId} mono />
          <Row k="URL Sito Ponte" v={bridgeSiteUrl || "—"} mono />
          <Row k="Bridge API Key" v={bridgeApiKey ? maskKey(bridgeApiKey) : "—"} mono />
          <Row k="Callback URL" v={callbackUrl} mono />
        </dl>
      ),
    },
    {
      title: "Conferma finale",
      hideNav: true,
      content: (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">
              <strong>Prima aggiungi lo store sul Sito B</strong> e incolla lì tutti i valori appena copiati
              (UUID, URL Sito Ponte, Bridge API Key, Callback URL). Solo dopo conferma qui: il salvataggio avvia
              la registrazione e l'handshake verso il Sito B.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <span className="font-semibold">Errore [{error.stage}]:</span> {error.message}
            </div>
          )}

          <label className="flex items-center gap-3 rounded-lg border p-3">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={confirmedOnB}
              disabled={submitting}
              onChange={(e) => {
                setConfirmedOnB(e.target.checked);
                if (e.target.checked) handleSave();
              }}
            />
            <span className="text-sm">
              {submitting ? "Salvataggio in corso…" : "Sì, l'ho già aggiunto su Sito B — crea lo store"}
            </span>
          </label>
        </div>
      ),
    },
  ];

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Nuovo store</DialogTitle>
      </DialogHeader>
      <Wizard
        steps={steps}
        submitting={submitting}
        finalLabel="Crea store"
        onComplete={handleSave}
        onCancel={onCancel}
      />
    </DialogContent>
  );
}

// ---------- helper UI ----------
function stage(stage: string, message: string): Error & { stage: string } {
  const e = new Error(message) as Error & { stage: string };
  e.stage = stage;
  return e;
}
function maskKey(k: string): string {
  if (k.length <= 10) return "••••";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

function LabeledField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={`max-w-[62%] truncate text-right text-xs ${mono ? "font-mono" : ""}`} title={v}>
        {v}
      </dd>
    </div>
  );
}
