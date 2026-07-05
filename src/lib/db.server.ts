// Server-only Postgres client (Lovable Cloud DATABASE_URL).
// Create clients per query: Worker request I/O objects cannot be reused globally.
import postgres from "postgres";

export function createSql() {
  const url =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("DATABASE_URL/SUPABASE_DB_URL is not set");
  return postgres(url, { max: 1, prepare: false, idle_timeout: 1 });
}

export async function pgQuery<T = any>(
  text: string,
  params: any[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const sql = createSql();
  try {
    // .unsafe() supports classical $1, $2 placeholders.
    const rows = (await sql.unsafe(text, params)) as unknown as T[];
    return { rows, rowCount: rows.length };
  } finally {
    await sql.end({ timeout: 1 });
  }
}
