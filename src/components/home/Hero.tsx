import React from "react";
import Image from "next/image";
import SticksWheel from "./SticksWheel";

export default function Hero() {
  return (
    <section className="hero-section" id="heroSection">
      {/* Giant Low-Opacity Background Wordmark for Depth */}
      <div className="hero-watermark" aria-hidden="true">
        Icespot
      </div>

      {/* Floating Decorative Objects with Depth of Field (Desktop) */}
      <div className="floating-decor decor-strawberry-top" aria-hidden="true">
        <Image
          src="/assets/floating-strawberry.png"
          alt=""
          width={110}
          height={110}
          priority
        />
      </div>

      <div className="floating-decor decor-almonds-right" aria-hidden="true">
        <Image
          src="/assets/floating-almonds.png"
          alt=""
          width={150}
          height={150}
          priority
        />
      </div>

      <div className="floating-decor decor-almonds-bottom-left" aria-hidden="true">
        <Image
          src="/assets/floating-almonds.png"
          alt=""
          width={220}
          height={220}
          priority
        />
      </div>

      <div className="floating-decor decor-strawberry-bottom-right" aria-hidden="true">
        <Image
          src="/assets/floating-strawberry.png"
          alt=""
          width={170}
          height={170}
          priority
        />
      </div>

      {/* Mobile-Only Flowing Subtle Fruits Aligned with Drip Divider */}
      <div className="hero-mobile-flowing-fruits" aria-hidden="true">
        <div className="mobile-fruit-strawberry">
          <Image
            src="/assets/floating-strawberry-slice.png"
            alt=""
            width={160}
            height={160}
            priority
          />
        </div>
        <div className="mobile-fruit-kiwi">
          <Image
            src="/assets/floating-kiwi-slice.png"
            alt=""
            width={160}
            height={160}
            priority
          />
        </div>
        <span className="mobile-fruit-drop drop-1" />
        <span className="mobile-fruit-drop drop-2" />
        <span className="mobile-fruit-drop drop-3" />
        <span className="mobile-fruit-drop drop-4" />
      </div>

      {/* Ten Ice Cream Sticks Circular Attraction */}
      <SticksWheel />

      {/* Hero Typography Block */}
      <div className="hero-content">
        <h1 className="hero-headline" id="heroHeadline">
          Indulge in Creamy Delights
        </h1>
        <p className="hero-subtitle" id="heroSubtitle">
          10 Signature Handcrafted Sticks &bull; Live in Freshness
        </p>
      </div>
    </section>
  );
}
