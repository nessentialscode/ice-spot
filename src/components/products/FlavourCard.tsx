"use client";

import React from "react";
import Image from "next/image";
import { Flavour } from "@/types";
import { useOrderModal } from "@/context/OrderModalContext";

interface FlavourCardProps {
  flavour: Flavour;
}

export default function FlavourCard({ flavour }: FlavourCardProps) {
  const { openOrderModal } = useOrderModal();

  return (
    <div
      className="group relative bg-white rounded-3xl p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl border border-rose-100 flex flex-col justify-between overflow-hidden"
      style={{
        boxShadow: "0 10px 30px rgba(109, 12, 39, 0.06)",
      }}
    >
      {/* Background Soft Glow */}
      <div
        className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-20 pointer-events-none transition-opacity group-hover:opacity-40"
        style={{ backgroundColor: flavour.color }}
      />

      <div>
        {/* Card Header & Badge */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <span
            className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border"
            style={{
              color: flavour.color,
              borderColor: `${flavour.color}44`,
              backgroundColor: `${flavour.color}14`,
            }}
          >
            {flavour.category}
          </span>
          {flavour.isPopular && (
            <span className="text-[10px] font-extrabold uppercase tracking-wide bg-gradient-to-r from-amber-500 to-rose-500 text-white px-2.5 py-0.5 rounded-full shadow-sm">
              Popular Pick
            </span>
          )}
        </div>

        {/* Product Image Stage */}
        <div className="relative w-full h-56 flex items-center justify-center my-2 group-hover:scale-105 transition-transform duration-300">
          <Image
            src={flavour.showcaseImg}
            alt={flavour.name}
            width={180}
            height={260}
            className="object-contain max-h-full drop-shadow-md"
            loading="lazy"
          />
        </div>

        {/* Info */}
        <h3 className="text-xl font-extrabold text-[#6D0C27] tracking-tight mb-1">
          {flavour.name}
        </h3>
        <p className="text-xs font-semibold text-[#D83162] mb-3">
          {flavour.tagline}
        </p>
        <p className="text-sm text-gray-600 line-clamp-3 mb-4 leading-relaxed">
          {flavour.description}
        </p>

        {/* Ingredients Pills */}
        {flavour.ingredients && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {flavour.ingredients.map((ing) => (
              <span
                key={ing}
                className="text-[11px] bg-rose-50/80 text-rose-900/80 px-2.5 py-0.5 rounded-md font-medium"
              >
                {ing}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-4 border-t border-rose-50 flex items-center justify-between gap-3 mt-auto">
        <button
          onClick={() => openOrderModal(flavour.name)}
          className="w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          style={{
            background: `linear-gradient(135deg, ${flavour.color}, #6D0C27)`,
          }}
        >
          <span>Order / Inquire</span>
          <span>&rarr;</span>
        </button>
      </div>
    </div>
  );
}
