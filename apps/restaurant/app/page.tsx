import { redirect } from "next/navigation";

// Splash — middleware sends an authenticated, capable owner straight to
// /dashboard and everyone else to /login before this ever renders in
// practice; this redirect is the honest fallback for the rare direct hit.
export default function RootPage() {
  redirect("/login");
}
