// Auth server functions (email/password, cookie-session backed).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { pgQuery } from "./db.server";
import { getAppSession } from "./auth-session.server";

async function ensureUsersTable() {
  // Add password/email columns to auth.users (created during migrations).
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS encrypted_password text;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb DEFAULT '{}'::jsonb;
  `);
}

export const signInWithPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email(), password: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    await ensureUsersTable();
    const { rows } = await pgQuery<{ id: string; email: string; encrypted_password: string | null }>(
      `SELECT id, email, encrypted_password FROM auth.users WHERE lower(email) = lower($1) LIMIT 1`,
      [data.email],
    );
    const user = rows[0];
    if (!user || !user.encrypted_password) {
      return { user: null, error: "Invalid login credentials" };
    }
    const ok = await bcrypt.compare(data.password, user.encrypted_password);
    if (!ok) return { user: null, error: "Invalid login credentials" };

    const session = await getAppSession();
    await session.update({ userId: user.id, email: user.email, role: "authenticated" });
    return { user: { id: user.id, email: user.email }, error: null };
  });

export const signUpWithPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email(), password: z.string().min(6) }).parse(d))
  .handler(async ({ data }) => {
    await ensureUsersTable();
    const hash = await bcrypt.hash(data.password, 10);
    try {
      const { rows } = await pgQuery<{ id: string; email: string }>(
        `INSERT INTO auth.users (email, encrypted_password) VALUES ($1, $2) RETURNING id, email`,
        [data.email, hash],
      );
      const u = rows[0];
      const session = await getAppSession();
      await session.update({ userId: u.id, email: u.email, role: "authenticated" });
      return { user: u, error: null };
    } catch (e: any) {
      return { user: null, error: e?.message || "Sign up failed" };
    }
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const session = await getAppSession();
  await session.clear();
  return { ok: true };
});

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getAppSession();
  if (!session.data?.userId) return { user: null };
  return {
    user: {
      id: session.data.userId,
      email: session.data.email,
      role: session.data.role || "authenticated",
    },
  };
});
