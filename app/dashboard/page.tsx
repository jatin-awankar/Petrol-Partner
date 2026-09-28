import { redirect } from "next/navigation";
import { getServerCurrentUser } from "@/lib/server-auth";

export default async function DashboardPage() {
  const user = await getServerCurrentUser();
  redirect(user ? "/search-rides" : "/login");
}
