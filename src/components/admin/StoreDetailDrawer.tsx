import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Webhook,
  RotateCw,
  Loader2,
} from "lucide-react";

interface Props {
  storeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StoreFull {
  id: string;
  shop_domain: string;
  display_name: string | null;
  health_status: string;
  consecutive_errors: number;
  avg_latency_ms: number;
  last_webhook_at: string | null;
  last_ping_at: string | null;
  last_health_check: string | null;
  last_offline: string | null;
  last_online: string | null;
  offline_reason: string | null;
  recent_failures: number;
  is_active: boolean;
  is_online: boolean;
  is_current: boolean;
  needs_reauth: boolean;
  rotation_threshold: number;
  custom_threshold: number | null;
  cap_amount: number | null;
  cap_window_revenue: number;
  cap_window_days: number;
  proxy_enabled: boolean;
  proxy_type: string;
  proxy_host: string | null;
  proxy_port: number | null;
  registered_webhook_topics: string[] | null;
  webhooks_registered_at: string | null;
  oauth_scopes: string | null;
}

interface RotationEntry {
  id: string;
  trigger_type: string;
  reason: string | null;
  from_revenue: number | null;
  to_revenue: number | null;
  created_at: string;
  from_store_id: string | null;
  to_store_id: string | null;
}

interface WebhookEntry {
  id: string;
  topic: string;
  signature_valid: boolean;
  processed: boolean;
  amount: number | null;
  currency: string | null;
  received_at: string;
  error_message: string | null;
}

const HEALTH_BADGE: Record<string, string> = {
  online:
    "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  degraded:
    "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  offline:
    "bg-destructive/15 text-destructive border-destructive/30",
  recovering:
    "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 animate-pulse",
};

function fmtAgo(d: string | null): string {
  if (!d) return "mai";
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "ora";
  if (m < 60) return `${m}m fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.floor(h / 24)}d fa`;
}

export function StoreDetailDrawer({ storeId, open, onOpenChange }: Props) {
  const [store, setStore] = useState<StoreFull | null>(null);
  const [rotations, setRotations] = useState<RotationEntry[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !storeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [s, r, w] = await Promise.all([
        supabase.from("stores").select("*").eq("id", storeId).maybeSingle(),
        supabase
          .from("rotation_log")
          .select(
            "id, trigger_type, reason, from_revenue, to_revenue, created_at, from_store_id, to_store_id",
          )
          .or(`from_store_id.eq.${storeId},to_store_id.eq.${storeId}`)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("webhook_events")
          .select(
            "id, topic, signature_valid, processed, amount, currency, received_at, error_message",
          )
          .eq("store_id", storeId)
          .order("received_at", { ascending: false })
          .limit(10),
      ]);
      if (cancelled) return;
      setStore((s.data as StoreFull) || null);
      setRotations((r.data as RotationEntry[]) || []);
      setWebhooks((w.data as WebhookEntry[]) || []);
      setLoading(false);
    })();

    // Realtime subscription scoped to this store
    const ch = supabase
      .channel(`store-detail-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stores", filter: `id=eq.${storeId}` },
        (payload: any) => {
          setStore((prev) =>
            prev ? ({ ...prev, ...(payload.new as Partial<StoreFull>) } as StoreFull) : prev,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "webhook_events", filter: `store_id=eq.${storeId}` },
        (payload: any) => {
          setWebhooks((prev) => [payload.new as WebhookEntry, ...prev].slice(0, 10));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [open, storeId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{store?.display_name || store?.shop_domain || "Store"}</SheetTitle>
          <SheetDescription>
            {store?.shop_domain}
            {store?.is_current && (
              <Badge variant="outline" className="ml-2 border-yellow-500/40 text-yellow-600">
                corrente
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        {loading && !store && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {store && (
          <div className="mt-6 space-y-4">
            {store.needs_reauth && (
              <Card className="border-orange-500/50 bg-orange-500/5">
                <CardContent className="flex items-start gap-2 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                  <span>Re-OAuth richiesto per i nuovi scope.</span>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Metric
                icon={<Activity className="h-4 w-4" />}
                label="Health"
                value={
                  <Badge
                    variant="outline"
                    className={HEALTH_BADGE[store.health_status] || ""}
                  >
                    {store.health_status}
                  </Badge>
                }
              />
              <Metric
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Errori consecutivi"
                value={
                  <span
                    className={
                      store.consecutive_errors >= 5
                        ? "text-destructive font-semibold"
                        : store.consecutive_errors > 0
                          ? "text-orange-500 font-semibold"
                          : "text-green-600 font-semibold"
                    }
                  >
                    {store.consecutive_errors}
                  </span>
                }
              />
              <Metric
                icon={<Gauge className="h-4 w-4" />}
                label="Latenza media"
                value={
                  <span
                    className={
                      store.avg_latency_ms > 2000
                        ? "text-destructive"
                        : store.avg_latency_ms > 800
                          ? "text-orange-500"
                          : ""
                    }
                  >
                    {store.avg_latency_ms} ms
                  </span>
                }
              />
              <Metric
                icon={<Webhook className="h-4 w-4" />}
                label="Ultimo webhook"
                value={fmtAgo(store.last_webhook_at)}
              />
              <Metric
                icon={<Clock className="h-4 w-4" />}
                label="Ultimo health check"
                value={fmtAgo(store.last_health_check)}
              />
              <Metric
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Ultimo ping"
                value={fmtAgo(store.last_ping_at)}
              />
            </div>

            {store.offline_reason && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Motivo offline</div>
                  <div className="mt-1 text-destructive">{store.offline_reason}</div>
                </CardContent>
              </Card>
            )}

            <Section title="Configurazione">
              <Row label="Soglia rotazione">
                € {Number(store.custom_threshold ?? store.rotation_threshold).toFixed(0)}
                {store.custom_threshold && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    custom
                  </Badge>
                )}
              </Row>
              <Row label="Cap importo">
                € {Number(store.cap_amount ?? 0).toFixed(0)} / {store.cap_window_days}gg
              </Row>
              <Row label="Cap consumato">
                € {Number(store.cap_window_revenue || 0).toFixed(2)}
              </Row>
              <Row label="Proxy">
                {store.proxy_enabled ? (
                  <span>
                    {store.proxy_type} · {store.proxy_host}:{store.proxy_port}
                  </span>
                ) : (
                  <span className="text-muted-foreground">disabilitato</span>
                )}
              </Row>
              <Row label="Webhook registrati">
                {Array.isArray(store.registered_webhook_topics) &&
                store.registered_webhook_topics.length > 0
                  ? store.registered_webhook_topics.length
                  : "nessuno"}
                {store.webhooks_registered_at && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({fmtAgo(store.webhooks_registered_at)})
                  </span>
                )}
              </Row>
            </Section>

            <Section
              title={
                <span className="inline-flex items-center gap-2">
                  <RotateCw className="h-4 w-4" /> Ultime rotazioni
                </span>
              }
            >
              {rotations.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Nessuna rotazione coinvolge questo store.
                </div>
              ) : (
                <div className="space-y-2">
                  {rotations.map((r) => {
                    const direction = r.from_store_id === store.id ? "→ out" : "← in";
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded border border-border/50 p-2 text-xs"
                      >
                        <div>
                          <div className="font-medium">
                            {r.trigger_type}{" "}
                            <span className="text-muted-foreground">{direction}</span>
                          </div>
                          {r.reason && (
                            <div className="text-muted-foreground mt-0.5 line-clamp-2">
                              {r.reason}
                            </div>
                          )}
                        </div>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {fmtAgo(r.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section
              title={
                <span className="inline-flex items-center gap-2">
                  <Webhook className="h-4 w-4" /> Webhook recenti
                </span>
              }
            >
              {webhooks.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Nessun webhook ricevuto.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {webhooks.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between gap-2 rounded border border-border/50 p-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {w.topic}
                        </Badge>
                        {!w.signature_valid && (
                          <Badge variant="destructive" className="text-[10px] shrink-0">
                            HMAC ✗
                          </Badge>
                        )}
                        {w.amount != null && (
                          <span className="font-mono truncate">
                            {w.currency || "EUR"} {Number(w.amount).toFixed(2)}
                          </span>
                        )}
                        {w.error_message && (
                          <span className="text-destructive truncate">{w.error_message}</span>
                        )}
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {fmtAgo(w.received_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="rounded-lg border border-border p-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 text-sm py-1.5 first:pt-0 last:pb-0 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
