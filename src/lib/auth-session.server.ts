// Cookie session config + helpers (server-only).
import { useSession } from "@tanstack/react-start/server";

export type AppSession = {
  userId?: string;
  email?: string;
  role?: string;
};

export function sessionConfig() {
  const password = process.env.SESSION_SECRET || process.env.DATABASE_URL || "dev-only-fallback-secret-please-change-me-32chars!";
  return {
    password: password.padEnd(32, "x"),
    name: "lov_session",
    maxAge: 60 * 60 * 24 * 30,
    cookie: { httpOnly: true, sameSite: "lax" as const, path: "/" },
  };
}

export async function getAppSession() {
  return useSession<AppSession>(sessionConfig());
}
