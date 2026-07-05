// Logger unificato su system_logs. Usato da ogni edge function.
// deno-lint-ignore-file no-explicit-any

export type LogLevel = "info" | "success" | "warning" | "error" | "rotate" | "webhook";

export async function logSystem(
  supabase: any,
  args: {
    level: LogLevel;
    category?: string;
    store_id?: string | null;
    message: string;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await supabase.from("system_logs").insert({
      level: args.level,
      category: args.category || "system",
      store_id: args.store_id ?? null,
      message: args.message.slice(0, 4000),
      metadata: args.metadata ?? {},
    });
  } catch (e) {
    console.error("[logger] insert failed:", (e as Error).message);
  }
}
