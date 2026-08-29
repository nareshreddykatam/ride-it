/**
 * A rejected Supabase table call or RPC (e.g. a BEFORE INSERT trigger's
 * `raise exception`, or `raise exception ... using errcode = 'P0001'`
 * inside a SECURITY DEFINER function) throws a plain
 * `{ code, details, hint, message }` object — not a native `Error`
 * instance. `e instanceof Error` is therefore the wrong check for
 * surfacing that message to a user and silently falls through to a
 * generic fallback; use this instead.
 */
export function errorMessage(e: unknown): string | null {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return null;
}
