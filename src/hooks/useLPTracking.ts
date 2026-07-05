import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "lp_session_id";
const VISITOR_KEY = "lp_visitor_id";
const PAGES_KEY = "lp_pages";

function uid() {
  return (
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

function getOrCreate(key: string, store: Storage) {
  let v = store.getItem(key);
  if (!v) {
    v = uid();
    store.setItem(key, v);
  }
  return v;
}

function parseUTM() {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get("utm_source") || undefined,
    utm_medium: p.get("utm_medium") || undefined,
    utm_campaign: p.get("utm_campaign") || undefined,
    utm_content: p.get("utm_content") || undefined,
    utm_term: p.get("utm_term") || undefined,
  };
}

function detectDevice() {
  if (typeof navigator === "undefined") return { is_mobile: false, device_type: "desktop", browser: "unknown" };
  const ua = navigator.userAgent;
  const is_mobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  const device_type = is_mobile ? (/iPad|Tablet/i.test(ua) ? "tablet" : "mobile") : "desktop";
  let browser = "other";
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = "chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "safari";
  else if (/Firefox/i.test(ua)) browser = "firefox";
  else if (/Edg/i.test(ua)) browser = "edge";
  return { is_mobile, device_type, browser };
}

interface UseLPTrackingArgs {
  productId?: string | null;
  enabled?: boolean;
}

export function useLPTracking({ productId, enabled = true }: UseLPTrackingArgs) {
  const initialized = useRef(false);
  const startTime = useRef(Date.now());
  const maxScroll = useRef(0);
  const clicks = useRef(0);
  const sessionId = useRef<string>("");
  const milestones = useRef<{ p25: number; p50: number; p75: number; p100: number }>({
    p25: 0,
    p50: 0,
    p75: 0,
    p100: 0,
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (initialized.current) return;
    initialized.current = true;

    const session_id = getOrCreate(SESSION_KEY, sessionStorage);
    const visitor_id = getOrCreate(VISITOR_KEY, localStorage);
    sessionId.current = session_id;

    let pages: string[] = [];
    try {
      pages = JSON.parse(sessionStorage.getItem(PAGES_KEY) || "[]");
    } catch {
      pages = [];
    }
    const currentPath = window.location.pathname;
    if (pages[pages.length - 1] !== currentPath) pages.push(currentPath);
    sessionStorage.setItem(PAGES_KEY, JSON.stringify(pages.slice(-20)));

    const utm = parseUTM();
    const device = detectDevice();

    (async () => {
      const { error: insErr } = await supabase.from("sessions").insert({
        session_id,
        visitor_id,
        product_id: productId ?? null,
        landing_page: window.location.href.slice(0, 2048),
        referrer: (document.referrer || "").slice(0, 2048),
        device_type: device.device_type,
        browser: device.browser,
        is_mobile: device.is_mobile,
        bounce: pages.length <= 1,
        pages_path: pages,
        events: [],
        ...utm,
      });
      if (insErr) {
        await supabase
          .from("sessions")
          .update({
            product_id: productId ?? null,
            pages_path: pages,
            bounce: pages.length <= 1,
            last_activity: new Date().toISOString(),
          })
          .eq("session_id", session_id);
      }
    })();

    // Scroll depth + milestones (25/50/75/100)
    const fireMilestone = async (key: "p25" | "p50" | "p75" | "p100", pct: number) => {
      if (milestones.current[key]) return;
      milestones.current[key] = Date.now();
      const { data } = await supabase.from("sessions").select("events").eq("session_id", session_id).maybeSingle();
      const prev = Array.isArray(data?.events) ? (data!.events as unknown[]) : [];
      const nextEvents = [...prev, { type: "scroll_milestone", pct, ts: new Date().toISOString() }];
      await supabase
        .from("sessions")
        .update({ events: nextEvents as never })
        .eq("session_id", session_id);
    };

    const onScroll = () => {
      const h = document.documentElement;
      const scrolled = h.scrollTop + window.innerHeight;
      const total = h.scrollHeight;
      const pct = Math.min(100, Math.round((scrolled / total) * 100));
      if (pct > maxScroll.current) maxScroll.current = pct;
      if (pct >= 25) void fireMilestone("p25", 25);
      if (pct >= 50) void fireMilestone("p50", 50);
      if (pct >= 75) void fireMilestone("p75", 75);
      if (pct >= 95) void fireMilestone("p100", 100);
    };

    const onClick = () => {
      clicks.current += 1;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("click", onClick, { passive: true });

    const flush = async (final = false) => {
      const time_on_page = Math.floor((Date.now() - startTime.current) / 1000);
      const bounce = !(maxScroll.current > 25 || time_on_page > 10 || clicks.current > 0);
      const update = final
        ? {
            scroll_depth: maxScroll.current,
            time_on_page,
            clicks: clicks.current,
            last_activity: new Date().toISOString(),
            bounce,
          }
        : {
            scroll_depth: maxScroll.current,
            time_on_page,
            clicks: clicks.current,
            last_activity: new Date().toISOString(),
          };
      await supabase.from("sessions").update(update).eq("session_id", session_id);
    };

    const interval = setInterval(() => flush(false), 15000);

    const onBeforeUnload = () => {
      flush(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("click", onClick);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      flush(true);
    };
  }, [enabled, productId]);

  return { sessionId: sessionId.current };
}

export function markSessionConverted() {
  if (typeof window === "undefined") return;
  const session_id = sessionStorage.getItem(SESSION_KEY);
  if (!session_id) return;
  void supabase.from("sessions").update({ converted: true, bounce: false }).eq("session_id", session_id);
}
