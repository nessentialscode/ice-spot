"use client";

import React, { useState } from "react";
import { X, Plus, Sparkles, Check } from "lucide-react";
import { AdminProduct } from "@/types/admin";

interface AddFlavourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProduct: (product: Omit<AdminProduct, "id"> & { id?: string }) => void;
  existingCount: number;
}

const COLOR_PRESETS = [
  { name: "Rose Berry", hex: "#E22F62", bg: "bg-[#E22F62]" },
  { name: "Alphonso Gold", hex: "#E8A238", bg: "bg-[#E8A238]" },
  { name: "Pistachio Leaf", hex: "#5A9E38", bg: "bg-[#5A9E38]" },
  { name: "Blueberry Violet", hex: "#6E3CBC", bg: "bg-[#6E3CBC]" },
  { name: "Dark Chocolate", hex: "#4A2810", bg: "bg-[#4A2810]" },
  { name: "Tender Coconut", hex: "#E5E1D8", bg: "bg-[#E5E1D8]" },
  { name: "Spanish Delight", hex: "#D97706", bg: "bg-[#D97706]" },
];

export function AddFlavourModal({
  isOpen,
  onClose,
  onAddProduct,
  existingCount,
}: AddFlavourModalProps) {
  const nextNum = (existingCount + 1).toString().padStart(2, "0");

  const [name, setName] = useState("");
  const [sku, setSku] = useState(`FLV-SIG-${nextNum}`);
  const [category, setCategory] = useState("Signature Fruit Stick");
  const [packType, setPackType] = useState("Box of 10 Sticks");
  const [unitsPerPack, setUnitsPerPack] = useState(10);
  const [currentStock, setCurrentStock] = useState(250);
  const [minStockAlert, setMinStockAlert] = useState(50);
  const [selectedColor, setSelectedColor] = useState("#E22F62");
  const [description, setDescription] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const id = `flv-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36).slice(-4)}`;

    onAddProduct({
      id,
      name: name.trim(),
      sku: sku.trim() || `SKU-${Date.now().toString(36).toUpperCase()}`,
      category,
      packType,
      unitsPerPack: Number(unitsPerPack) || 10,
      currentStock: Number(currentStock) || 0,
      reservedStock: 0,
      minStockAlert: Number(minStockAlert) || 50,
      color: selectedColor,
      imageUrl: "/images/flavours/default-stick.png",
      isAvailable: true,
      isActive: true,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-[26px] max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-rose-100 flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#E22F62] to-[#B51B47] text-white flex items-center justify-center shadow-md shadow-rose-900/20">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>Add Handcrafted Flavour</span>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-rose-50 text-[#BD1F49] border border-rose-200">
                  New SKU
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Register a new signature stick or tub in Varavoor cold-storage inventory
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-semibold text-slate-700">
          {/* Flavour Name & SKU */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Flavour Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Alphonso Mango Real Stick"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  const autoSku = `FLV-${e.target.value.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, "X") || "SIG"}-${nextNum}`;
                  setSku(autoSku);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] focus:border-transparent text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                SKU Identifier Code *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. FLV-MANGO-011"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] focus:border-transparent text-sm font-medium uppercase font-mono"
              />
            </div>
          </div>

          {/* Category & Pack Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] text-sm bg-white font-medium"
              >
                <option value="Signature Fruit Stick">Signature Fruit Stick</option>
                <option value="Premium Kulfi Stick">Premium Kulfi Stick</option>
                <option value="Exotic Fruit Bar">Exotic Fruit Bar</option>
                <option value="Artisanal Cream Tub">Artisanal Cream Tub</option>
                <option value="Seasonal Special">Seasonal Special</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Packaging Crate Type
              </label>
              <select
                value={packType}
                onChange={(e) => {
                  setPackType(e.target.value);
                  if (e.target.value.includes("24")) setUnitsPerPack(24);
                  else if (e.target.value.includes("10")) setUnitsPerPack(10);
                  else if (e.target.value.includes("12")) setUnitsPerPack(12);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] text-sm bg-white font-medium"
              >
                <option value="Box of 10 Sticks">Box of 10 Sticks (Standard Crate)</option>
                <option value="Box of 24 Sticks">Box of 24 Sticks (Bulk Master Box)</option>
                <option value="Box of 12 Sticks">Box of 12 Sticks</option>
                <option value="Tub 5 Litres">Tub 5 Litres (Parlour Scoop)</option>
              </select>
            </div>
          </div>

          {/* Stock Levels & Thresholds */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Units Per Crate
              </label>
              <input
                type="number"
                min="1"
                value={unitsPerPack}
                onChange={(e) => setUnitsPerPack(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Initial Stock (Units)
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={currentStock}
                onChange={(e) => setCurrentStock(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Low Stock Alert At
              </label>
              <input
                type="number"
                min="10"
                step="10"
                value={minStockAlert}
                onChange={(e) => setMinStockAlert(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] text-sm font-medium"
              />
            </div>
          </div>

          {/* Color Palette Theme */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Accent Color Theme
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_PRESETS.map((color) => (
                <button
                  type="button"
                  key={color.hex}
                  onClick={() => setSelectedColor(color.hex)}
                  className={`w-8 h-8 rounded-full ${color.bg} border-2 flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${
                    selectedColor === color.hex ? "border-slate-900 scale-110 shadow-md ring-2 ring-rose-400" : "border-white"
                  }`}
                  title={color.name}
                >
                  {selectedColor === color.hex && (
                    <Check className={`w-4 h-4 stroke-[3] ${color.hex === "#E5E1D8" ? "text-slate-900" : "text-white"}`} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Tagline */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Production Tagline or Ingredients (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Crafted with pure mango fruit chunks and farm cream..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] text-xs font-medium"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D83162] to-[#B51B47] hover:from-[#B51B47] hover:to-[#6D0C27] text-white text-xs font-bold shadow-md shadow-rose-900/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Register &amp; Add Flavour</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
