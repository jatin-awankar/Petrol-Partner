import React from "react";
import "react-loading-skeleton/dist/skeleton.css";
import SearchComponent from "@/components/searchRides/SearchComponent";
import SuggestedRides from "@/components/searchRides/SuggestedRides";
import NearbyRides from "@/components/searchRides/NearbyRides";

const SearchRidesPage = () => {
  return (
    <div className="page container min-h-screen bg-background py-8 px-4 md:px-8">
      <SearchComponent />
      <SuggestedRides />
      <NearbyRides />
    </div>
  );
};

export default SearchRidesPage;
