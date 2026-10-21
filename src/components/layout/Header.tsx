"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useOrderModal } from "@/context/OrderModalContext";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { openOrderModal } = useOrderModal();

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Our Flavours", href: "/flavours" },
    { label: "Know Us", href: "/about" },
    { label: "Locations", href: "/locations" },
    { label: "Contact Us", href: "/contact" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="site-header" id="home">
      {/* Left: Brand Logo */}
      <Link href="/" className="brand-logo" id="headerLogo" aria-label="Ice Spot Varavoor Home">
        <Image
          src="/assets/icespot-logo-new.png"
          alt="Icespot - Live in Freshness"
          className="header-logo-img"
          width={175}
          height={52}
          priority
        />
      </Link>

      {/* Center: Navigation Links */}
      <nav
        className={`main-nav ${mobileOpen ? "mobile-open" : ""}`}
        id="mainNav"
        aria-label="Main Navigation"
      >
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${isActive(link.href) ? "active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            {link.label}
          </Link>
        ))}

        {/* Mobile-only Order Button inside drawer */}
        <div className="mobile-only-nav-action md:hidden mt-4">
          <button
            onClick={() => {
              setMobileOpen(false);
              openOrderModal("Varavoor Factory Specials");
            }}
            className="btn-order-pill w-full justify-center"
          >
            Explore &amp; Order
          </button>
        </div>
      </nav>

      {/* Right: Explore Now Button & Mobile Toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          onClick={() => openOrderModal("Signature Ice Creams")}
          className="btn-order-pill hidden sm:inline-flex"
          id="headerOrderBtn"
        >
          Explore Now
        </button>

        <button
          className="mobile-nav-toggle"
          id="mobileNavToggle"
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>
    </header>
  );
}
