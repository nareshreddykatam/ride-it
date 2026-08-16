/**
 * Single source of truth for Supabase environment variables. Every other
 * file in this package reads env vars through these functions rather than
 * touching `process.env` directly, so a missing var fails fast with a clear
 * message instead of a confusing runtime error deep in a query.
 *
 * Expected in each consuming app's `.env.local` (see .env.example):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY   (server-only — never exposed to the browser)
 *
 * REAL BUG, FOUND AGAINST THE ACTUAL DEPLOYED SUPABASE PROJECT: this file
 * originally read every variable through a single generic
 * `readEnv(key: string)` helper that did `process.env[key]` — a dynamic,
 * computed member access. Next.js's client bundler (webpack/Turbopack)
 * inlines `NEXT_PUBLIC_*` variables into the browser bundle via a
 * *static, textual* replacement of the literal expression
 * `process.env.NEXT_PUBLIC_SOMETHING` at build time — it cannot see
 * through a computed access like `process.env[key]`, because `key` is
 * only known at runtime. In the browser, `process.env` is not the real
 * Node.js environment object; it only contains whatever literal
 * `NEXT_PUBLIC_*` expressions the bundler found and replaced. A dynamic
 * lookup therefore always evaluated to `undefined` client-side, even
 * with `.env.local` correctly configured and Next.js correctly loading
 * it — the value simply never made it into the bundle in the first
 * place. This is why the failure only showed up once a real Supabase
 * project made browser-side auth/query calls actually exercise
 * `getSupabaseUrl()`/`getSupabaseAnonKey()` — no amount of local
 * type-checking or server-side testing could have caught it, since
 * server code reads the real `process.env` at runtime regardless of
 * access style.
 *
 * Fixed by resolving each `NEXT_PUBLIC_*` variable via its own literal,
 * statically-analyzable expression at the call site, and passing the
 * already-resolved value into a validation helper — the helper no
 * longer performs the lookup itself, only the fail-fast check, so every
 * actual `process.env.X` access in this file is a literal Next.js can
 * see and inline.
 */

function assertPresent(key: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `[@ride-it/supabase] Missing environment variable "${key}". ` +
        `Copy .env.example to .env.local in this app and fill it in.`
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  // Literal expression required — see the file header. Do not refactor
  // this into a helper that takes the variable name as a parameter and
  // performs the `process.env[...]` lookup internally; that reintroduces
  // exactly the bug this fixes.
  return assertPresent("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabaseAnonKey(): string {
  return assertPresent("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Server-only — throws if accidentally called from a browser bundle.
 * `SUPABASE_SERVICE_ROLE_KEY` is intentionally NOT `NEXT_PUBLIC_*`, so
 * Next.js never inlines it into any client bundle in the first place;
 * this function's `window` check is an additional, explicit guard on
 * top of that, not a substitute for it. Reading it via `process.env`
 * directly (rather than through `readEnv`) is unaffected by the
 * bug above either way, since this only ever runs in a real Node.js
 * server process, where `process.env` is the genuine environment object
 * and dynamic-vs-literal access makes no difference — kept as a literal
 * expression regardless, for consistency with the two functions above.
 */
export function getSupabaseServiceRoleKey(): string {
  if (typeof window !== "undefined") {
    throw new Error(
      "[@ride-it/supabase] getSupabaseServiceRoleKey() must never be called from the browser."
    );
  }
  return assertPresent("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}
