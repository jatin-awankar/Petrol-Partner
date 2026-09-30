import ParticipantHome from "@/components/ParticipantHome";
import { redirect } from "next/navigation";
import { getServerCurrentUser } from "@/lib/server-auth";

export default async function DashboardPage() {
  const user = await getServerCurrentUser();
  if (!user) redirect("/login");
  return <ParticipantHome />;
}
