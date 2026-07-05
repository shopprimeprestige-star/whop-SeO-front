import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Modalità "solo password": email admin fissa. Se la sessione corrisponde, è admin
// senza dipendere dalla tabella user_roles.
const FIXED_ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim().toLowerCase() || "";

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Set up listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        if (FIXED_ADMIN_EMAIL && newSession.user.email?.toLowerCase() === FIXED_ADMIN_EMAIL) {
          setIsAdmin(true);
        } else {
          // Defer role check to avoid blocking the listener
          setTimeout(() => {
            checkAdmin(newSession.user.id);
          }, 0);
        }
      } else {
        setIsAdmin(false);
      }
    });

    // Then load existing session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        if (FIXED_ADMIN_EMAIL && data.session.user.email?.toLowerCase() === FIXED_ADMIN_EMAIL) {
          setIsAdmin(true);
          setLoading(false);
        } else {
          checkAdmin(data.session.user.id).finally(() => setLoading(false));
        }
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function checkAdmin(userId: string) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(!!data);
  }

  return {
    session,
    user: session?.user ?? null,
    loading,
    isAdmin,
  };
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/login";
}
