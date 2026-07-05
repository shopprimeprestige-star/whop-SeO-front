import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuthFallback } from "@/lib/auth-attacher-fallback";

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuthFallback],
}));