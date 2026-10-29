"use client";

import React, { useEffect, useRef } from "react";
import { useOrderModal } from "@/context/OrderModalContext";

export default function OrderModal() {
  const { isOpen, selectedItem, closeOrderModal } = useOrderModal();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Prevent background scrolling while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeOrderModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, closeOrderModal]);

  if (!isOpen) return null;

  const handleWhatsAppClick = () => {
    const message = encodeURIComponent(
      `Hello Ice Spot Varavoor Factory! I would like to inquire about: ${selectedItem}. Could you please share available flavours, franchise details, and factory timings?`
    );
    window.open(`https://wa.me/?text=${message}`, "_blank", "noopener,noreferrer");
    closeOrderModal();
  };

  return (
    <div
      className="modal-backdrop open"
      id="orderModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeOrderModal();
        }
      }}
    >
      <div className="modal-window" ref={modalRef}>
        <button
          className="modal-close"
          aria-label="Close modal"
          onClick={closeOrderModal}
        >
          &times;
        </button>

        <span className="modal-header-badge">
          ✨ Varavoor Direct Factory Inquiry
        </span>

        <h3 id="modalTitle">Order / Inquire</h3>

        <div className="modal-selected-badge">
          <span>Selected flavour:</span>
          <strong id="modalSelectedProduct" style={{ color: "var(--color-hero-red)", fontWeight: 800 }}>
            {selectedItem}
          </strong>
        </div>

        {/* Responsive Popping Cards Grid Over Ice Creams */}
        <div className="order-options-grid">
          {/* Card 1: WhatsApp Inquiry */}
          <div
            className="order-option-card"
            id="btnOrderWhatsApp"
            onClick={handleWhatsAppClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleWhatsAppClick();
              }
            }}
          >
            <div className="order-option-top">
              <div className="order-option-icon-box bg-emerald-50 text-emerald-600 border border-emerald-200">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <span className="order-option-tag bg-emerald-100/80 text-emerald-800">
                Instant Chat
              </span>
            </div>
            <div className="order-option-info">
              <h4>Send WhatsApp Inquiry</h4>
              <p>Direct chat with Varavoor factory for wholesale, retail packs &amp; flavours</p>
            </div>
            <div className="order-option-footer text-emerald-700">
              <span>Open WhatsApp</span>
              <span>&rarr;</span>
            </div>
          </div>

          {/* Card 2: Factory Phone Hotline */}
          <a
            href="tel:+919447000000"
            className="order-option-card"
            onClick={closeOrderModal}
          >
            <div className="order-option-top">
              <div className="order-option-icon-box bg-amber-50 text-amber-600 border border-amber-200">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <span className="order-option-tag bg-amber-100/80 text-amber-800">
                Call Direct
              </span>
            </div>
            <div className="order-option-info">
              <h4>Factory Phone Hotline</h4>
              <p>+91 94470 00000 &bull; 9 AM - 8 PM Dispatch Desk</p>
            </div>
            <div className="order-option-footer text-amber-700">
              <span>Call Dispatcher</span>
              <span>&rarr;</span>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
