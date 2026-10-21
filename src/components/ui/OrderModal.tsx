"use client";

import React, { useEffect, useRef } from "react";
import { useOrderModal } from "@/context/OrderModalContext";
import Link from "next/link";

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
        <h3 id="modalTitle">Order / Inquire</h3>
        <p>
          Selected item:{" "}
          <strong id="modalSelectedProduct" style={{ color: "var(--color-hero-red)" }}>
            {selectedItem}
          </strong>
        </p>

        <div
          className="order-option-card"
          id="btnOrderWhatsApp"
          style={{ cursor: "pointer" }}
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
          <span className="order-option-icon" aria-hidden="true">💬</span>
          <div className="order-option-info">
            <h4 className="font-bold">Send WhatsApp Inquiry</h4>
            <p>Direct chat with Ice Spot Varavoor Factory for flavours, franchise &amp; orders</p>
          </div>
        </div>

        <Link
          href="/contact"
          className="order-option-card"
          onClick={closeOrderModal}
        >
          <span className="order-option-icon" aria-hidden="true">📍</span>
          <div className="order-option-info">
            <h4 className="font-bold">Visit Ice Spot Varavoor Factory</h4>
            <p>Varavoor, Wadakkanchery, Thrissur, Kerala 680585</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
