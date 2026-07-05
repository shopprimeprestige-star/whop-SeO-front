import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CACHE_KEY = "lp_bot_check";

export function useBotCheck() {
  const [isBot, setIsBot] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // session-cached
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached !== null) {
      setIsBot(cached === "1");
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const { data } = await supabase.functions.invoke("bot-filter", {
          body: { path: window.location.pathname },
        });
        const bot = !!data?.bot;
        if (!cancelled) {
          sessionStorage.setItem(CACHE_KEY, bot ? "1" : "0");
          setIsBot(bot);
        }
      } catch {
        if (!cancelled) setIsBot(false);
      }
    };

    // Differiamo a dopo il first paint per non bloccare TBT/LCP.
    const ric: any = (window as any).requestIdleCallback;
    const handle = ric
      ? ric(run, { timeout: 3000 })
      : setTimeout(run, 200);

    return () => {
      cancelled = true;
      const cic: any = (window as any).cancelIdleCallback;
      if (ric && cic) cic(handle);
      else clearTimeout(handle);
    };
  }, []);

  return isBot;
}
