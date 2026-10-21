import React from "react";
import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        {/* Brand Column */}
        <div className="footer-brand">
          <Link href="/" className="brand-logo footer-brand-logo" aria-label="Ice Spot Home">
            <Image
              src="/assets/icespot-logo-new.png"
              alt="Ice Spot - Live in Freshness"
              className="footer-logo-img"
              width={160}
              height={48}
            />
          </Link>

          {/* Desktop Tagline & Badge */}
          <p className="footer-tagline footer-tagline-desktop">
            Serving handcrafted dessert pleasures, rich fruit shakes, authentic Falooda, and refreshing ice candies &bull; Main Production Factory &amp; Franchise Hub, Varavoor.
          </p>
          <div className="footer-badge footer-badge-desktop">
            <span className="badge-dot"></span>
            <span>Ice Spot Varavoor &bull; 4.2 ★ Production Factory &amp; Hub</span>
          </div>

          {/* Mobile Tagline & Badge */}
          <p className="footer-tagline footer-tagline-mobile">
            Serving handcrafted dessert pleasures, rich fruit shakes, authentic Falooda &amp; refreshing ice candies &bull; Main Franchise &amp; Factory Hub, Ice Spot Varavoor.
          </p>
          <div className="footer-badge footer-badge-mobile">
            <span className="badge-dot"></span>
            <span>Ice Spot Varavoor &bull; 4.2 ★ Verified Hub</span>
          </div>
        </div>

        {/* Navigation Links Group */}
        <div className="footer-nav-columns">
          <div className="footer-col">
            <h4>Navigation</h4>
            <ul className="footer-links">
              <li><Link href="/">Home</Link></li>
              <li><Link href="/flavours">Our Flavours</Link></li>
              <li><Link href="/about">Know Us</Link></li>
              <li><Link href="/locations">Find Locations</Link></li>
              <li><Link href="/contact">Contact Us</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Menu Highlights</h4>
            <ul className="footer-links">
              <li><Link href="/flavours">English Delight</Link></li>
              <li><Link href="/flavours">Sharjah Shake</Link></li>
              <li><Link href="/flavours">Royal Falooda</Link></li>
              <li><Link href="/flavours">Pista Shake</Link></li>
              <li><Link href="/flavours">Artisanal Ice Lollies</Link></li>
            </ul>
          </div>

          <div className="footer-col footer-col-location">
            <h4>Factory &amp; Location</h4>
            <ul className="footer-links">
              <li><Link href="/locations">Find Nearby Branch</Link></li>
              <li><Link href="/contact">Varavoor Factory, Thrissur</Link></li>
              <li><Link href="/contact">Wadakkanchery, Kerala</Link></li>
              <li className="desktop-only"><Link href="/about#reviews">Customer Reviews</Link></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="footer-bottom-desktop">
          <p>&copy; {new Date().getFullYear()} Ice Spot Varavoor. All rights reserved.</p>
          <p>Main Production Factory &amp; Central Franchise Hub &bull; Varavoor, Wadakkanchery, Thrissur</p>
        </div>
        <div className="footer-bottom-mobile">
          <p>&copy; {new Date().getFullYear()} Ice Spot Varavoor. All rights reserved.</p>
          <p>Main Franchise &amp; Factory Hub &bull; Varavoor, Wadakkanchery, Thrissur</p>
        </div>
      </div>
    </footer>
  );
}
