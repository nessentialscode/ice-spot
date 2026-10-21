"use client";

import React from "react";
import { useOrderModal } from "@/context/OrderModalContext";

export default function ContactSection() {
  const { openOrderModal } = useOrderModal();

  return (
    <section className="contact-section" id="contact">
      <div className="contact-layout">
        {/* Address & Contact Info */}
        <div className="contact-card-box">
          <span className="section-tag">Main Factory &amp; Headquarters</span>
          <h3>
            <span className="contact-title-desktop">Ice Spot Varavoor Factory</span>
            <span className="contact-title-mobile">Ice Spot Varavoor</span>
          </h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.95rem" }}>
            Main manufacturing factory &amp; central franchise headquarters in Varavoor, Wadakkanchery, Thrissur.
          </p>

          <div className="contact-info-list">
            <div className="contact-info-item">
              <div className="contact-icon" aria-hidden="true">📍</div>
              <div className="contact-text">
                <h4>Address</h4>
                <p>Main Manufacturing Factory &amp; Central Franchise Hub, Varavoor, Wadakkanchery, Thrissur, Kerala 680585, India</p>
              </div>
            </div>

            <div className="contact-info-item">
              <div className="contact-icon" aria-hidden="true">🏭</div>
              <div className="contact-text">
                <h4>Facility Category</h4>
                <p>Central Manufacturing Factory &bull; Franchise Headquarters &bull; Artisanal Production</p>
              </div>
            </div>

            <div className="contact-info-item">
              <div className="contact-icon" aria-hidden="true">✨</div>
              <div className="contact-text">
                <h4>Key Highlights</h4>
                <p>Central Production Hub &bull; 10 Real Fruit Sticks &bull; Franchise Operations</p>
              </div>
            </div>
          </div>

          <div className="contact-actions">
            <button
              className="btn-whatsapp open-order-modal"
              onClick={() => openOrderModal("Ice Spot Varavoor Factory Inquiry")}
            >
              💬 Inquire on WhatsApp
            </button>
            <a
              href="https://maps.google.com/?q=Varavoor+Thrissur+Kerala"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary-outline"
            >
              Open in Maps ↗
            </a>
          </div>
        </div>

        {/* Google Maps Embed */}
        <div className="map-container">
          <iframe
            title="Ice Spot Varavoor Factory Location Map"
            src="https://maps.google.com/maps?q=Varavoor,Wadakkanchery,Thrissur,Kerala,680585&t=&z=14&ie=UTF8&iwloc=&output=embed"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          ></iframe>
        </div>
      </div>
    </section>
  );
}
