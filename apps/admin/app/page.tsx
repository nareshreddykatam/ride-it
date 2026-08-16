import { redirect } from "next/navigation";

export default function RootPage() {
  // Auth gating happens in middleware.ts (createAuthMiddleware) before this
  // page ever renders — an unauthenticated request never reaches here.
  redirect("/overview");
}
