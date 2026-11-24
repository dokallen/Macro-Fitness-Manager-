/**
 * In-memory stand-in for the Supabase client, for unit tests only.
 * Supports the query-builder calls this app uses and records every write,
 * so tests can assert exactly what would be written. Not a full emulator:
 * no RLS, no joins, filters are equality/in/range only.
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export type FakeWrite = {
  table: string;
  op: "insert" | "upsert" | "update" | "delete";
  rows?: Row[];
  patch?: Row;
};

export type FakeSupabase = {
  tables: Record<string, Row[]>;
  writes: FakeWrite[];
  /** Make the next write to `table` fail with this message. */
  failNextWrite: (table: string, message: string) => void;
  user: { id: string } | null;
  client: unknown;
};

let idSeq = 0;
const newId = () => `fake-${++idSeq}`;

export function createFakeSupabase(
  initial: Record<string, Row[]> = {},
  user: { id: string } | null = { id: "user-1" }
): FakeSupabase {
  const tables: Record<string, Row[]> = {};
  for (const [k, rows] of Object.entries(initial)) tables[k] = rows.map((r) => ({ ...r }));
  const writes: FakeWrite[] = [];
  const failures = new Map<string, string>();
  const state: FakeSupabase = {
    tables,
    writes,
    user,
    failNextWrite: (table, message) => failures.set(table, message),
    client: null,
  };

  const tableRows = (t: string) => (tables[t] ??= []);
  const takeFailure = (t: string) => {
    const m = failures.get(t);
    if (m !== undefined) failures.delete(t);
    return m;
  };

  function builder(table: string) {
    const filters: Filter[] = [];
    let op: "select" | FakeWrite["op"] = "select";
    let payload: Row[] = [];
    let patch: Row = {};
    let conflictKeys: string[] = [];
    let returnRows = false;
    let single: "single" | "maybe" | null = null;
    let order: { col: string; asc: boolean } | null = null;
    let limit: number | null = null;

    // Real rows pass through Postgres/JSON, so store and return copies made the same way.
    const asJson = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    const run = (): { data: unknown; error: { message: string } | null } => {
      if (op !== "select") {
        const fail = takeFailure(table);
        if (fail !== undefined) return { data: null, error: { message: fail } };
      }
      const rows = tableRows(table);
      let result: Row[] = [];
      if (op === "select") {
        result = rows.filter((r) => filters.every((f) => f(r)));
      } else if (op === "insert") {
        result = payload.map((r) => ({ id: newId(), ...asJson(r) }));
        rows.push(...result);
        writes.push({ table, op, rows: result });
      } else if (op === "upsert") {
        result = [];
        for (const r of payload.map(asJson)) {
          const existing = rows.find((x) => conflictKeys.every((k) => x[k] === r[k]));
          if (existing && conflictKeys.length) {
            Object.assign(existing, r);
            result.push(existing);
          } else {
            const row = { id: newId(), ...r };
            rows.push(row);
            result.push(row);
          }
        }
        writes.push({ table, op, rows: payload });
      } else if (op === "update") {
        result = rows.filter((r) => filters.every((f) => f(r)));
        for (const r of result) Object.assign(r, asJson(patch));
        writes.push({ table, op, patch, rows: result.map((r) => ({ ...r })) });
      } else if (op === "delete") {
        result = rows.filter((r) => filters.every((f) => f(r)));
        tables[table] = rows.filter((r) => !result.includes(r));
        writes.push({ table, op, rows: result });
      }
      if (order) {
        const { col, asc } = order;
        result = [...result].sort((a, b) =>
          String(a[col]) < String(b[col]) ? (asc ? -1 : 1) : String(a[col]) > String(b[col]) ? (asc ? 1 : -1) : 0
        );
      }
      if (limit !== null) result = result.slice(0, limit);
      if (single) {
        if (result.length === 0) {
          return single === "maybe"
            ? { data: null, error: null }
            : { data: null, error: { message: "No rows found" } };
        }
        return { data: { ...result[0] }, error: null };
      }
      if (op !== "select" && !returnRows) return { data: null, error: null };
      return { data: result.map((r) => ({ ...r })), error: null };
    };

    const b: Record<string, unknown> = {
      select: () => {
        if (op === "select") op = "select";
        else returnRows = true;
        return b;
      },
      insert: (rows: Row | Row[]) => {
        op = "insert";
        payload = Array.isArray(rows) ? rows : [rows];
        return b;
      },
      upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => {
        op = "upsert";
        payload = Array.isArray(rows) ? rows : [rows];
        conflictKeys = opts?.onConflict?.split(",").map((s) => s.trim()) ?? ["id"];
        return b;
      },
      update: (p: Row) => {
        op = "update";
        patch = p;
        return b;
      },
      delete: () => {
        op = "delete";
        return b;
      },
      eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), b),
      neq: (col: string, val: unknown) => (filters.push((r) => r[col] !== val), b),
      in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), b),
      gte: (col: string, val: unknown) => (filters.push((r) => String(r[col]) >= String(val)), b),
      gt: (col: string, val: unknown) => (filters.push((r) => String(r[col]) > String(val)), b),
      lte: (col: string, val: unknown) => (filters.push((r) => String(r[col]) <= String(val)), b),
      lt: (col: string, val: unknown) => (filters.push((r) => String(r[col]) < String(val)), b),
      like: (col: string, pattern: string) => {
        const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`);
        filters.push((r) => re.test(String(r[col])));
        return b;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        order = { col, asc: opts?.ascending !== false };
        return b;
      },
      limit: (n: number) => ((limit = n), b),
      single: () => ((single = "single"), b),
      maybeSingle: () => ((single = "maybe"), b),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        try {
          return Promise.resolve(run()).then(resolve, reject);
        } catch (e) {
          return reject ? reject(e) : Promise.reject(e);
        }
      },
    };
    return b;
  }

  state.client = {
    from: (table: string) => builder(table),
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  };
  return state;
}
