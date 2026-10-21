import React from "react";
import BranchDirectory from "@/components/locations/BranchDirectory";
import DripDivider from "@/components/home/DripDivider";

export const metadata = {
  title: "Store Locations | Ice Spot Varavoor & Kerala Franchises",
  description:
    "Find an Ice Spot near you. Explore our central manufacturing factory in Varavoor, Wadakkanchery and verified branches across Thrissur, Ernakulam, and Palakkad.",
};

export default function LocationsPage() {
  return (
    <div className="bg-[#FAF9F6]">
      {/* Locations Hero Banner */}
      <section className="relative px-6 pt-28 pb-10 md:pt-32 md:pb-20 text-center bg-[radial-gradient(ellipse_140%_120%_at_50%_20%,#F55D85_0%,#E22F62_42%,#C91D4C_72%,#BD1F49_100%)] text-white overflow-hidden">

        <div className="relative max-w-3xl mx-auto z-10">
          <span className="inline-block text-xs uppercase tracking-widest font-extrabold bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/30 mb-4 shadow-sm">
            Central Factory &amp; Regional Outlets
          </span>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4 text-white">
            Find Your Closest Icespot Parlour
          </h1>
          <p className="text-base md:text-lg text-rose-100 font-medium leading-relaxed">
            From our primary production factory in Varavoor, Wadakkanchery to parlours throughout Thrissur and Kerala, fresh ice cream is never far away.
          </p>
        </div>
      </section>

      <DripDivider />

      <div className="py-8">
        <BranchDirectory showIntro={false} />
      </div>
    </div>
  );
}
