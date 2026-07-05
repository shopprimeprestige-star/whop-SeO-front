import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { Minus, Plus, Trash2, Loader2, ShoppingBag, Copy, Check, Info } from "lucide-react";
import { toast } from "sonner";
import { bridgeCheckout, BridgeCheckoutError, warmBridgeCheckout } from "@/lib/shadow-checkout";
import { useI18n } from "@/lib/i18n";

interface CheckoutErrorInfo {
  title: string;
  message: string;
  details: string;
}

function checkoutDebugPayload(err: BridgeCheckoutError, extra: Record<string, unknown>) {
  const detail = (err.detail || {}) as any;
  const diagnosis = detail?.diagnosis;
  return {
    errore_reale: diagnosis?.summary || err.message,
    cause: diagnosis?.real_errors || [],
    correzioni: diagnosis?.suggested_fixes || [],
    store_falliti: diagnosis?.failed_stores || [],
    http_status: err.httpStatus,
    detail: err.detail,
    ...extra,
    timestamp: new Date().toISOString(),
  };
}

function getSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  let id = sessionStorage.getItem("hs_session_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("hs_session_id", id);
  }
  return id;
}

export function CartDrawer() {
  const { items, isOpen, close, setQty, remove, total } = useCart();
  const { currency, convert, lang } = useI18n();
  const [loadingLine, setLoadingLine] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [errorInfo, setErrorInfo] = useState<CheckoutErrorInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || items.length === 0) return;
    warmBridgeCheckout({
      items: items.map((it) => ({
        product_slug: it.product_slug,
        variant_label: it.variant_label,
        quantity: it.quantity,
        unit_price: convert(it.price),
      })),
      currency,
      language: lang,
      session_id: getSessionId(),
    });
  }, [isOpen, items, currency, lang, convert]);

  function showError(info: CheckoutErrorInfo) {
    setCopied(false);
    setErrorInfo(info);
    console.error("[checkout]", info);
  }

  async function checkout(item: (typeof items)[number]) {
    const key = `${item.product_slug}:${item.variant_label || ""}`;
    setLoadingLine(key);
    try {
      const result = await bridgeCheckout({
        product_slug: item.product_slug,
        variant_label: item.variant_label,
        quantity: item.quantity,
        currency,
        language: lang,
        unit_price: convert(item.price),
        session_id: getSessionId(),
      });
      window.location.href = result.redirect_url;
    } catch (e) {
      const err = e as BridgeCheckoutError;
      showError({
        title: "Checkout fallito",
        message: err.message || "Errore durante la chiamata al Sito Ponte.",
        details: JSON.stringify(
          checkoutDebugPayload(err, {
            item: {
              product_slug: item.product_slug,
              variant_label: item.variant_label,
              quantity: item.quantity,
            },
          }),
          null,
          2,
        ),
      });
    } finally {
      setLoadingLine(null);
    }
  }

  async function checkoutAll() {
    if (items.length === 0) return;
    setLoadingAll(true);
    try {
      const result = await bridgeCheckout({
        items: items.map((it) => ({
          product_slug: it.product_slug,
          variant_label: it.variant_label,
          quantity: it.quantity,
          unit_price: convert(it.price),
        })),
        currency,
        language: lang,
        session_id: getSessionId(),
      });
      window.location.href = result.redirect_url;
    } catch (e) {
      const err = e as BridgeCheckoutError;
      showError({
        title: "Checkout completo fallito",
        message: err.message || "Errore durante la chiamata al Sito Ponte.",
        details: JSON.stringify(
          checkoutDebugPayload(err, {
            items: items.map((it) => ({
              product_slug: it.product_slug,
              variant_label: it.variant_label,
              quantity: it.quantity,
            })),
          }),
          null,
          2,
        ),
      });
    } finally {
      setLoadingAll(false);
    }
  }

  async function copyError() {
    if (!errorInfo) return;
    try {
      await navigator.clipboard.writeText(
        `[${errorInfo.title}]\n${errorInfo.message}\n\n${errorInfo.details}`,
      );
      setCopied(true);
      toast.success("Log copiato");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossibile copiare");
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(v) => !v && close()}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Il tuo carrello</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <ShoppingBag className="h-10 w-10 opacity-50" />
            <p className="text-sm">Il carrello è vuoto.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto py-4">
              {items.map((item) => {
                const key = `${item.product_slug}:${item.variant_label || ""}`;
                return (
                  <div
                    key={key}
                    className="flex gap-3 rounded-lg border border-border bg-card/40 p-3"
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.product_name}
                        className="h-16 w-16 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-md bg-muted" />
                    )}
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold leading-tight">{item.product_name}</p>
                          {item.variant_label && (
                            <p className="text-xs text-muted-foreground">{item.variant_label}</p>
                          )}
                        </div>
                        <button
                          onClick={() => remove(item.product_slug, item.variant_label)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() =>
                              setQty(item.product_slug, item.variant_label, item.quantity - 1)
                            }
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">
                            {item.quantity}
                          </span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() =>
                              setQty(item.product_slug, item.variant_label, item.quantity + 1)
                            }
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="text-[14px] font-medium tabular-nums">
                          € {(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="mt-2"
                        disabled={loadingLine === key}
                        onClick={() => checkout(item)}
                      >
                        {loadingLine === key ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : null}
                        Acquista ora
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border pt-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Totale stimato</span>
                <span className="text-[16px] font-medium tabular-nums">€ {total().toFixed(2)}</span>
              </div>
              <Button
                size="lg"
                className="w-full"
                disabled={loadingAll || items.length === 0}
                onClick={checkoutAll}
              >
                {loadingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Vai al checkout ({items.length} {items.length === 1 ? "prodotto" : "prodotti"})
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Tutti i prodotti vengono inviati insieme in un unico ordine.
              </p>
            </div>
          </>
        )}
      </SheetContent>

      <Dialog open={!!errorInfo} onOpenChange={(v) => !v && setErrorInfo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-destructive">{errorInfo?.title}</DialogTitle>
          </DialogHeader>
          {errorInfo && (
            <div className="space-y-3">
              <p className="text-sm">{errorInfo.message}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Info className="inline h-3 w-3 mr-1" /> Dettagli
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyError}
                  className="h-7 gap-1.5 text-xs"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copiato" : "Copia log"}
                </Button>
              </div>
              <pre className="max-h-[50vh] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all">
                {errorInfo.details}
              </pre>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setErrorInfo(null)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
