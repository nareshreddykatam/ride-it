import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@ride-it/supabase/server";
import { createSignedUrl } from "@ride-it/supabase/storage";
import { getMatchedDriverQrPath } from "@ride-it/data";

/**
 * GET -> { signedUrl: string } | { signedUrl: null }
 *
 * The [id] param is the ride id, never a driver id or storage path — the
 * path itself is resolved server-side via get_matched_driver_qr_path()
 * (SECURITY DEFINER, migration 20260831160000), which only returns a row
 * when the caller is the ride's own passenger, the ride has reached a
 * fare-final status, driver_upi is the selected payment method, and the
 * driver's QR has actually been admin-approved. This route never accepts
 * a client-supplied path/driver id, so there is no way to request another
 * driver's QR code by guessing an id, and it structurally cannot return an
 * unverified QR image.
 *
 * The admin (service-role) client is used only for the narrow signed-URL
 * mint itself — Storage RLS has no "matched passenger" policy on the
 * driver-payment-qr bucket (by design, see the migration comment), so
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
    path = await getMatchedDriverQrPath(supabase, params.id);
  } catch {
    return NextResponse.json({ error: "Couldn't look up payment QR" }, { status: 400 });
  }
  if (!path) {
    return NextResponse.json({ signedUrl: null });
  }

  try {
    const admin = getSupabaseAdminClient();
    const signedUrl = await createSignedUrl(admin, "driver-payment-qr", path, 300);
    return NextResponse.json({ signedUrl });
  } catch {
    return NextResponse.json({ signedUrl: null });
  }
}
