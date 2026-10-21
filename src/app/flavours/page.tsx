"use client";

import React, { useState, useMemo } from "react";
import { FLAVOURS } from "@/lib/data/flavours";
import FlavourCard from "@/components/products/FlavourCard";
import DripDivider from "@/components/home/DripDivider";

export default function FlavoursPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const cats = new Set(FLAVOURS.map((f) => f.category));
    return ["all", ...Array.from(cats)];
  }, []);

  const filteredFlavours = useMemo(() => {
    if (selectedCategory === "all") return FLAVOURS;
    return FLAVOURS.filter((f) => f.category === selectedCategory);
  }, [selectedCategory]);

  return (
    <div className="bg-[#FAF9F6]">
      {/* Flavours Hero Header */}
      <section className="relative px-6 pt-28 pb-10 md:pt-32 md:pb-20 text-center bg-[radial-gradient(ellipse_140%_120%_at_50%_20%,#F55D85_0%,#E22F62_42%,#C91D4C_72%,#BD1F49_100%)] text-white overflow-hidden">

        <div className="relative max-w-4xl mx-auto z-10">
          <span className="inline-block text-xs uppercase tracking-widest font-extrabold bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/30 mb-4 shadow-sm">
            10 Real Fruit Signature Sticks
          </span>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight mb-4 text-white md:whitespace-nowrap">
            Our Handcrafted Flavour Catalogue
          </h1>
          <p className="text-base md:text-lg text-rose-100 font-medium leading-relaxed">
            Crafted directly in our Varavoor production factory. Made with 100% natural fruit pulp, pure Malabar cream, and traditional cold churn methods.
          </p>
        </div>
      </section>

      <DripDivider />

      {/* Flavour Grid Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-12">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-5 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-200 capitalize ${
                selectedCategory === cat
                  ? "bg-[#D83162] text-white shadow-lg shadow-rose-900/20 scale-105"
                  : "bg-white text-gray-700 hover:bg-rose-50 border border-gray-200"
              }`}
            >
              {cat === "all" ? "All 10 Signature Flavours" : cat}
            </button>
          ))}
        </div>

        {/* Flavours Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
          {filteredFlavours.map((flavour) => (
            <FlavourCard key={flavour.id} flavour={flavour} />
          ))}
        </div>

        {/* Production Quality Highlight */}
        <div className="mt-20 bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-rose-100 text-center max-w-4xl mx-auto">
          <span className="text-3xl mb-3 block">🍓🥛✨</span>
          <h3 className="text-2xl font-black text-[#6D0C27] mb-3">
            The Varavoor Factory Purity Guarantee
          </h3>
          <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed text-sm md:text-base">
            Every stick is churned and frozen in small batches using sun-ripened fruits and authentic dairy cream. No artificial essence, no synthetic fats — just real dessert pleasure in every bite.
          </p>
        </div>
      </section>
    </div>
  );
}
