"use client";

import React, { useState } from "react";
import ContactSection from "@/components/home/ContactSection";
import DripDivider from "@/components/home/DripDivider";

export default function ContactPage() {
  const [formState, setFormState] = useState({
    name: "",
    phone: "",
    email: "",
    enquiryType: "franchise",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const encodedMsg = encodeURIComponent(
      `*New Factory Enquiry from Website*\n*Name:* ${formState.name}\n*Phone:* ${formState.phone}\n*Type:* ${formState.enquiryType}\n*Message:* ${formState.message || "I would like to inquire about Icespot."}`
    );
    window.open(`https://wa.me/?text=${encodedMsg}`, "_blank", "noopener,noreferrer");
    setSubmitted(true);
  };

  return (
    <div className="bg-[#FAF9F6]">
      {/* Contact Hero Header */}
      <section className="relative px-6 pt-28 pb-10 md:pt-32 md:pb-20 text-center bg-[radial-gradient(ellipse_140%_120%_at_50%_20%,#F55D85_0%,#E22F62_42%,#C91D4C_72%,#BD1F49_100%)] text-white overflow-hidden">

        <div className="relative max-w-3xl mx-auto z-10">
          <span className="inline-block text-xs uppercase tracking-widest font-extrabold bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/30 mb-4 shadow-sm">
            Reach The Central Factory Hub
          </span>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4 text-white">
            Get in Touch With Us
          </h1>
          <p className="text-base md:text-lg text-rose-100 font-medium leading-relaxed">
            Connect with Ice Spot Varavoor Factory for flavour orders, regional franchise partnerships, or wholesale distribution inquiries.
          </p>
        </div>
      </section>

      <DripDivider />

      {/* Online Enquiry Form Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-rose-100">
          <div className="text-center max-w-xl mx-auto mb-8">
            <span className="text-xs uppercase tracking-widest font-extrabold text-[#D83162] bg-rose-50 px-3.5 py-1 rounded-full">
              Direct Factory Inquiry
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#6D0C27] mt-3 mb-2">
              Send an Official Enquiry
            </h2>
            <p className="text-gray-600 text-sm">
              Fill in your details below and immediately connect with our Varavoor team on WhatsApp or submit for follow-up.
            </p>
          </div>

          {submitted ? (
            <div className="p-8 text-center bg-emerald-50 border border-emerald-200 rounded-2xl">
              <span className="text-4xl block mb-2">✅</span>
              <h4 className="text-lg font-bold text-emerald-900 mb-1">Enquiry Prepared!</h4>
              <p className="text-sm text-emerald-700 mb-4">
                Your enquiry has been formatted and opened for direct communication with the Varavoor headquarters.
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="text-xs font-bold uppercase tracking-wider text-emerald-800 underline hover:text-emerald-950"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="name" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Your Name *
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    placeholder="Enter full name"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Phone / WhatsApp Number *
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    placeholder="+91 98765 43210"
                    value={formState.phone}
                    onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="email" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Email Address (Optional)
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@domain.com"
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="enquiryType" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Enquiry Type *
                  </label>
                  <select
                    id="enquiryType"
                    value={formState.enquiryType}
                    onChange={(e) => setFormState({ ...formState, enquiryType: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] focus:border-transparent text-sm bg-white"
                  >
                    <option value="franchise">Franchise Partnership</option>
                    <option value="bulk_order">Event / Bulk Ice Cream Order</option>
                    <option value="wholesale">Distribution / Wholesale</option>
                    <option value="general">General Feedback or Question</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="message" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Your Message
                </label>
                <textarea
                  id="message"
                  rows={4}
                  placeholder="Share details about your requirement, location, or inquiry..."
                  value={formState.message}
                  onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D83162] focus:border-transparent text-sm"
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-[#D83162] to-[#B51B47] hover:from-[#B51B47] hover:to-[#6D0C27] shadow-lg shadow-rose-900/20 transition-all duration-200 text-sm flex items-center justify-center gap-2"
              >
                <span>💬 Submit &amp; Chat on WhatsApp</span>
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Existing Location Cards & Map */}
      <ContactSection />
    </div>
  );
}
