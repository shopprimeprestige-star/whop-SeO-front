// Edge function registry stub. Add ported implementations here as needed.
// Each entry is `(body: any) => Promise<any>`.

import { bridgeHandshake, bridgeCheckoutFn } from "@/lib/bridge.functions";

export const registry: Record<string, (body: any) => Promise<any>> = {
  "geo-detect": async () => ({ country: "US", country_code: "US", city: null, region: null, ip: null }),
  "bot-filter": async () => ({ is_bot: false, score: 0 }),
  "track-event": async () => ({ ok: true }),
  "bridge-handshake": async (body: any) => bridgeHandshake({ data: { store_id: body?.store_id } }),
  "bridge-checkout": async (body: any) => bridgeCheckoutFn({ data: body ?? {} }),
};


