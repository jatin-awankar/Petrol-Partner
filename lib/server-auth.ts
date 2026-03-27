import { cookies } from "next/headers";

import { getCurrentUserFromBackendServer } from "./api/backend";

export async function getServerCurrentUser() {
  const cookieStore = await cookies();
  return getCurrentUserFromBackendServer(cookieStore.toString());
}
