"use client";

import Player from "lottie-react";
import Bike from "../public/loader/Bike.json";

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Player autoplay loop animationData={Bike} className="w-64 h-64" />
    </div>
  );
}
