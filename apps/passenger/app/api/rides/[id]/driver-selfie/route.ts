import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@ride-it/supabase/server";
import { createSignedUrl } from "@ride-it/supabase/storage";
import { getMatchedDriverSelfiePath } from "@ride-it/data";

/**
 * GET -> { signedUrl: string } | { signedUrl: null }
 *
 * The [id] param is the ride id, never a driver id or storage path — the
 * path itself is resolved server-side via get_matched_driver_selfie_path()
 * (SECURITY DEFINER, migration 20260827090000), which only returns a row
 * when the caller is the ride's own passenger and the ride is currently
 * active. This route never accepts a client-supplied path/driver id, so
 * there is no way to request another driver's selfie by guessing an id.
 *
 * The admin (service-role) client is used only for the narrow signed-URL
 * mint itself — Storage RLS has no "matched passenger" policy on the
 * driver-documents bucket (by design, see the migration comment), so
 * minting requires bypassing it; authorization is enforced entirely by the
 * RPC call above, not by this client's elevated privileges.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let path: string | null;
  try {
    path = await getMatchedDriverSelfiePath(supabase, params.id);
  } catch {
    return NextResponse.json({ error: "Couldn't look up driver photo" }, { status: 400 });
  }
  if (!path) {
    return NextResponse.json({ signedUrl: null });
  }

  try {
    const admin = getSupabaseAdminClient();
    const signedUrl = await createSignedUrl(admin, "driver-documents", path, 300);
    return NextResponse.json({ signedUrl });
  } catch {
    return NextResponse.json({ signedUrl: null });
  }
}
