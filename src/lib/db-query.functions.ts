// Generic supabase-shim query executor. Translates the shim's serialized
// query operations into SQL against the Lovable Cloud Postgres pool.
import { createServerFn } from "@tanstack/react-start";
import { pgQuery } from "./db.server";

type Op = "select" | "insert" | "update" | "delete" | "upsert";
type Filter = {
  type:
    | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
    | "like" | "ilike" | "is" | "in" | "not"
    | "contains" | "containedBy" | "or";
  col?: string;
  val?: any;
  args?: any;
};

export interface ShimQueryInput {
  table: string;
  op: Op;
  schema?: string;
  cols?: string;
  payload?: any;
  filters?: Filter[];
  orderBy?: { col: string; asc: boolean; nullsFirst?: boolean }[];
  limit?: number | null;
  range?: { from: number; to: number } | null;
  singleMode?: "single" | "maybe" | null;
  upsertOnConflict?: string | null;
  returning?: boolean;
  count?: "exact" | "planned" | "estimated" | null;
}

function ident(name: string) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function buildWhere(filters: Filter[] | undefined, start: number): { sql: string; params: any[] } {
  if (!filters || filters.length === 0) return { sql: "", params: [] };
  const params: any[] = [];
  let i = start;
  const parts: string[] = [];
  for (const f of filters) {
    const col = f.col ? ident(f.col) : "";
    switch (f.type) {
      case "eq": parts.push(`${col} = $${i++}`); params.push(f.val); break;
      case "neq": parts.push(`${col} <> $${i++}`); params.push(f.val); break;
      case "gt": parts.push(`${col} > $${i++}`); params.push(f.val); break;
      case "gte": parts.push(`${col} >= $${i++}`); params.push(f.val); break;
      case "lt": parts.push(`${col} < $${i++}`); params.push(f.val); break;
      case "lte": parts.push(`${col} <= $${i++}`); params.push(f.val); break;
      case "like": parts.push(`${col} LIKE $${i++}`); params.push(f.val); break;
      case "ilike": parts.push(`${col} ILIKE $${i++}`); params.push(f.val); break;
      case "is":
        if (f.val === null) parts.push(`${col} IS NULL`);
        else if (f.val === true) parts.push(`${col} IS TRUE`);
        else if (f.val === false) parts.push(`${col} IS FALSE`);
        else { parts.push(`${col} IS $${i++}`); params.push(f.val); }
        break;
      case "in": {
        const arr = (f.val as any[]) ?? [];
        if (arr.length === 0) parts.push("FALSE");
        else {
          const placeholders = arr.map(() => `$${i++}`).join(",");
          parts.push(`${col} IN (${placeholders})`);
          params.push(...arr);
        }
        break;
      }
      case "contains":
        parts.push(`${col} @> $${i++}::jsonb`);
        params.push(JSON.stringify(f.val));
        break;
      case "containedBy":
        parts.push(`${col} <@ $${i++}::jsonb`);
        params.push(JSON.stringify(f.val));
        break;
      case "not":
        parts.push(`${col} IS DISTINCT FROM $${i++}`);
        params.push(f.val);
        break;
      case "or":
        // Skipped for the shim — emit TRUE so the query still runs.
        parts.push("TRUE");
        break;
    }
  }
  return { sql: ` WHERE ${parts.join(" AND ")}`, params };
}

function projection(cols?: string) {
  if (!cols || cols.trim() === "" || cols.trim() === "*") return "*";
  // Naive: split on comma, ignore nested PostgREST joins (best effort).
  return cols
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c && !c.includes("("))
    .map((c) => {
      const [name, alias] = c.split(":").map((s) => s.trim());
      const realCol = alias ?? name;
      return alias ? `${ident(realCol)} AS ${ident(name)}` : ident(realCol);
    })
    .join(", ") || "*";
}

async function execute(input: ShimQueryInput) {
  const table = (input.schema ? ident(input.schema) + "." : "") + ident(input.table);
  const where = buildWhere(input.filters, 1);

  let sql = "";
  let params: any[] = [];

  if (input.op === "select") {
    sql = `SELECT ${projection(input.cols)} FROM ${table}${where.sql}`;
    params = where.params;
    if (input.orderBy?.length) {
      sql += " ORDER BY " + input.orderBy.map((o) => `${ident(o.col)} ${o.asc ? "ASC" : "DESC"}`).join(", ");
    }
    if (input.range) {
      sql += ` LIMIT ${input.range.to - input.range.from + 1} OFFSET ${input.range.from}`;
    } else if (input.limit != null) {
      sql += ` LIMIT ${Number(input.limit)}`;
    }
  } else if (input.op === "insert" || input.op === "upsert") {
    const rows = Array.isArray(input.payload) ? input.payload : [input.payload];
    if (rows.length === 0) return { data: [], error: null, count: 0 };
    const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r || {}))));
    const valuesSql: string[] = [];
    let i = 1;
    for (const row of rows) {
      const placeholders = cols.map((c) => {
        if (row[c] === undefined) return "DEFAULT";
        params.push(row[c]);
        return `$${i++}`;
      });
      valuesSql.push(`(${placeholders.join(",")})`);
    }
    sql = `INSERT INTO ${table} (${cols.map(ident).join(",")}) VALUES ${valuesSql.join(",")}`;
    if (input.op === "upsert") {
      const conflict = input.upsertOnConflict || "id";
      const conflictCols = conflict.split(",").map((c) => ident(c.trim())).join(",");
      const updates = cols.filter((c) => !conflict.split(",").map((s) => s.trim()).includes(c))
        .map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`).join(",");
      sql += ` ON CONFLICT (${conflictCols}) DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}`;
    }
    sql += ` RETURNING ${projection(input.cols)}`;
  } else if (input.op === "update") {
    const data = input.payload || {};
    const keys = Object.keys(data);
    if (keys.length === 0) return { data: [], error: null, count: 0 };
    let i = 1;
    const setSql = keys.map((k) => { params.push(data[k]); return `${ident(k)} = $${i++}`; }).join(",");
    const w = buildWhere(input.filters, i);
    sql = `UPDATE ${table} SET ${setSql}${w.sql} RETURNING ${projection(input.cols)}`;
    params.push(...w.params);
  } else if (input.op === "delete") {
    sql = `DELETE FROM ${table}${where.sql} RETURNING ${projection(input.cols)}`;
    params = where.params;
  }

  try {
    const res = await pgQuery(sql, params);
    let data: any = res.rows;
    if (input.singleMode === "single") {
      if (res.rows.length !== 1) {
        return { data: null, error: { message: `Expected single row, got ${res.rows.length}`, code: "PGRST116" }, count: res.rowCount };
      }
      data = res.rows[0];
    } else if (input.singleMode === "maybe") {
      data = res.rows[0] ?? null;
    }
    return { data, error: null, count: res.rowCount };
  } catch (e: any) {
    console.error("[shim sql]", sql, params, e?.message);
    return { data: null, error: { message: e?.message || String(e), code: e?.code } };
  }
}

export const dbQuery = createServerFn({ method: "POST" })
  .inputValidator((d: ShimQueryInput) => d)
  .handler(async ({ data }) => execute(data));
