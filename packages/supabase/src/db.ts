import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Generic database helpers. These are intentionally table-agnostic — no
 * schema exists yet (see types.ts), so nothing here assumes a particular
 * table shape. Once real tables exist and `types.ts` is regenerated, these
 * generics will pick up proper per-table typing automatically.
 *
 * These wrap the common CRUD shapes so call sites read as intent
 * ("getById", "listWhere") rather than repeating `.from().select().eq()`
 * chains, and so error handling is consistent in one place.
 */

export interface ListOptions {
  limit?: number;
  offset?: number;
  orderBy?: { column: string; ascending?: boolean };
}

// Once real tables exist in types.ts, `keyof Database["public"]["Tables"]`
// will naturally narrow this to a real union of table names — no change
// needed here when that happens.
type TableName = string;

export async function getById<T = Record<string, unknown>>(
  supabase: SupabaseClient<Database>,
  table: TableName,
  id: string
): Promise<T | null> {
  const { data, error } = await supabase.from(table as string).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as T | null;
}

export async function listWhere<T = Record<string, unknown>>(
  supabase: SupabaseClient<Database>,
  table: TableName,
  filters: Record<string, unknown> = {},
  options: ListOptions = {}
): Promise<T[]> {
  let query = supabase.from(table as string).select("*");

  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  if (options.orderBy) {
    query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true });
  }
  if (typeof options.limit === "number") {
    const from = options.offset ?? 0;
    query = query.range(from, from + options.limit - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function insertRow<T = Record<string, unknown>>(
  supabase: SupabaseClient<Database>,
  table: TableName,
  values: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.from(table as string).insert(values).select().single();
  if (error) throw error;
  return data as T;
}

export async function updateRow<T = Record<string, unknown>>(
  supabase: SupabaseClient<Database>,
  table: TableName,
  id: string,
  values: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.from(table as string).update(values).eq("id", id).select().single();
  if (error) throw error;
  return data as T;
}

export async function deleteRow(
  supabase: SupabaseClient<Database>,
  table: TableName,
  id: string
): Promise<void> {
  const { error } = await supabase.from(table as string).delete().eq("id", id);
  if (error) throw error;
}
