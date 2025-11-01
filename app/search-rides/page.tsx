import React from "react";
import SearchComponent from "@/components/searchRides/SearchComponent";
import SuggestedRides from "@/components/searchRides/SuggestedRides";
import NearbyRides from "@/components/searchRides/NearbyRides";
import { authOptions } from "@/lib/authOptions";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

const SearchRidesPage = async () => {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  return (
    <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
      <NearbyRides />
      <SearchComponent />
      <SuggestedRides />
    </div>
  );
};

export default SearchRidesPage;
