import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Login · Happy Scam CRM" }] }),
});

// Se impostata, il login è "solo password": l'email è fissa e nascosta.
const FIXED_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim().toLowerCase() || "";

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin" });
    });
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const normalizedEmail = FIXED_EMAIL || email.trim().toLowerCase();
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) throw error;
      setMessage({ type: "success", text: "Login riuscito, apertura pannello…" });
      toast.success("Login eseguito");
      navigate({ to: "/admin" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore imprevisto";
      setMessage({ type: "error", text: `Login fallito: ${msg}` });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background px-4">
      <Card className="w-full max-w-md border-border/60 shadow-2xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold tracking-tight">
            Happy<span className="text-primary">Scam</span>
          </CardTitle>
          <CardDescription>Accedi al pannello CRM</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!FIXED_EMAIL && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Attendi…" : "Accedi"}
            </Button>
            {message && (
              <p
                role={message.type === "error" ? "alert" : "status"}
                className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-primary"}
              >
                {message.text}
              </p>
            )}
            <div className="text-center text-xs text-muted-foreground">
              <Link to="/{-$locale}" params={{} as any} className="hover:text-foreground">← Torna alla vetrina</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
