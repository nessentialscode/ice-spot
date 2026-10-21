import React from "react";
import AboutSection from "@/components/home/AboutSection";
import ReviewsSection from "@/components/home/ReviewsSection";
import DripDivider from "@/components/home/DripDivider";

export const metadata = {
  title: "About Us | Ice Spot Varavoor Manufacturing Factory",
  description:
    "Learn about Ice Spot Varavoor, our primary ice cream production factory and franchise headquarters located in Wadakkanchery, Thrissur, Kerala.",
};

export default function AboutPage() {
  return (
    <div className="bg-[#FAF9F6]">
      {/* About Hero Header */}
      <section className="relative px-6 pt-28 pb-10 md:pt-32 md:pb-20 text-center bg-[radial-gradient(ellipse_140%_120%_at_50%_20%,#F55D85_0%,#E22F62_42%,#C91D4C_72%,#BD1F49_100%)] text-white overflow-hidden">

        <div className="relative max-w-4xl mx-auto z-10">
          <span className="inline-block text-xs uppercase tracking-widest font-extrabold bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/30 mb-4 shadow-sm">
            Central Factory Headquarters
          </span>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight mb-4 text-white md:whitespace-nowrap">
            Heart of Handcrafted Ice Creams
          </h1>
          <p className="text-base md:text-lg text-rose-100 font-medium leading-relaxed">
            Discover how Ice Spot Varavoor crafts Kerala&apos;s most loved real fruit sticks, authentic Falooda, and artisanal desserts with passion and pure ingredients.
          </p>
        </div>
      </section>

      <DripDivider />

      <AboutSection />

      {/* Production Story Cards */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-3xl border border-rose-100 shadow-sm text-center">
            <div className="w-14 h-14 bg-rose-100 text-[#D83162] rounded-2xl flex items-center justify-center text-2xl mx-auto mb-5 font-black">
              1
            </div>
            <h3 className="text-xl font-extrabold text-[#6D0C27] mb-3">Farm-Direct Fruits</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              We source sweet strawberries, Ratnagiri Alphonso mangoes, and tender coastal coconuts directly from verified orchards.
            </p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-rose-100 shadow-sm text-center">
            <div className="w-14 h-14 bg-rose-100 text-[#D83162] rounded-2xl flex items-center justify-center text-2xl mx-auto mb-5 font-black">
              2
            </div>
            <h3 className="text-xl font-extrabold text-[#6D0C27] mb-3">Slow Cold-Churning</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Our Varavoor facility uses precision churning technologies to achieve the dense, velvety micro-texture that defines Icespot sticks.
            </p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-rose-100 shadow-sm text-center">
            <div className="w-14 h-14 bg-rose-100 text-[#D83162] rounded-2xl flex items-center justify-center text-2xl mx-auto mb-5 font-black">
              3
            </div>
            <h3 className="text-xl font-extrabold text-[#6D0C27] mb-3">Cold Chain Delivery</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Freshly packaged sticks and gourmet shakes are delivered in refrigerated transports directly to parlours across Kerala.
            </p>
          </div>
        </div>
      </section>

      <ReviewsSection />
    </div>
  );
}
