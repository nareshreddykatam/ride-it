import { redirect } from "next/navigation";

export default function RootPage() {
  // TODO: gate behind admin auth once @ride-it/api-client auth is wired for admin roles
  redirect("/overview");
}
