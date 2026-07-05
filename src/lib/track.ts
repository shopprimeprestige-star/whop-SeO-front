// Lightweight client-side tracking helper.
// Fires browser pixels (Meta + TikTok) and forwards to track-event edge function.
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: { track: (event: string, data?: unknown) => void };
  }
}

function getVisitorId(): string {
  try {
    let v = localStorage.getItem("hs_visitor_id");
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem("hs_visitor_id", v);
    }
    return v;
  } catch {
    return "anon";
  }
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

export interface TrackData {
  email?: string;
  phone?: string;
  value?: number;
  currency?: string;
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
  num_items?: number;
  [key: string]: unknown;
}

export async function track(eventName: string, data: TrackData = {}) {
  const eventId = crypto.randomUUID();

  // Browser-side
  try {
    const { email: _e, phone: _p, ...custom } = data;
    if (typeof window !== "undefined") {
      window.fbq?.("track", eventName, custom, { eventID: eventId });
      window.ttq?.track(eventName, custom);
    }
  } catch {
    // ignore pixel errors
  }

  // Server-side (don't await — fire and forget)
  void supabase.functions
    .invoke("track-event", {
      body: {
        event_name: eventName,
        event_id: eventId,
        event_source_url: typeof window !== "undefined" ? window.location.href : undefined,
        user_data: {
          email: data.email,
          phone: data.phone,
          external_id: getVisitorId(),
          fbc: getCookie("_fbc"),
          fbp: getCookie("_fbp"),
          ttclid: getCookie("ttclid"),
        },
        custom_data: data,
      },
    })
    .catch(() => undefined);
}
