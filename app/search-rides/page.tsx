import React from "react";
import SearchComponent from "@/components/searchRides/SearchComponent";
import SuggestedRides from "@/components/searchRides/SuggestedRides";
import NearbyRides from "@/components/searchRides/NearbyRides";
import { redirect } from "next/navigation";
import { getServerCurrentUser } from "@/lib/server-auth";

const SearchRidesPage = async () => {
  const user = await getServerCurrentUser();
  if (!user) {
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
