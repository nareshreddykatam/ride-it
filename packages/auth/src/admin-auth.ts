import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin sign-in only — there is intentionally no `signUpAdminWithPassword`.
 * Admin accounts are provisioned out-of-band (a super admin creates the
 * auth user + admin_users row directly, or via the Supabase dashboard),
 * not through public self-registration. See Phase 4 review doc.
 */
export async function signInAdminWithPassword(
  supabase: SupabaseClient,
  email: string,
  password: string
) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
