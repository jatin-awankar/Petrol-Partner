import Navbar from "@/components/Navbar";
import BottomNavbar from "@/components/BottomNavbar";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export default async function AuthenticatedNavbars() {

  const session = await getServerSession(authOptions);

  if(session) {
    return (
      <>
        <Navbar />
        <BottomNavbar />
      </>
    );
  } else {
    return null;
  }
}
