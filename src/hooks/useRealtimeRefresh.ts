import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type TableName = "stores" | "store_stats" | "webhook_events" | "system_logs" | "rotation_log";

interface Options {
  /** Tables to subscribe to */
  tables: TableName[];
  /** Callback fired (debounced) when any of the tables changes */
  onChange: () => void;
  /** Channel name suffix for uniqueness */
  channel: string;
  /** Debounce window in ms (default 500) */
  debounceMs?: number;
  /** Disable subscription */
  enabled?: boolean;
}

/**
 * Subscribe to Postgres changes for one or more tables and call onChange
 * (debounced) whenever any of them updates. Cleans up on unmount.
 */
export function useRealtimeRefresh({
  tables,
  onChange,
  channel,
  debounceMs = 500,
  enabled = true,
}: Options) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cbRef.current(), debounceMs);
    };

    let ch = supabase.channel(`rt-${channel}`);
    for (const t of tables) {
      ch = ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: t },
        fire,
      );
    }
    ch.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, enabled, debounceMs, tables.join("|")]);
}
