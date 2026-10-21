import React from "react";
import Image from "next/image";

export default function AboutSection() {
  return (
    <section className="about-section" id="about">
      <div className="about-container">
        {/* Image & Rating Badge */}
        <div className="about-image-wrap">
          <Image
            src="/assets/know-us-sticks.png"
            alt="Icespot signature ice cream sticks"
            width={600}
            height={500}
            priority
          />
          <div className="about-rating-card">
            <span className="rating-number">4.2</span>
            <div>
              <div className="rating-stars" aria-label="4.2 out of 5 stars">
                ★★★★☆
              </div>
              <span className="rating-count">38 Google Reviews</span>
            </div>
          </div>
        </div>

        {/* Text Content */}
        <div className="about-content">
          <span className="section-tag">Know Us</span>
          <h2>The Central Ice Cream Production Factory in Varavoor</h2>
          <p>
            Situated in Varavoor, Wadakkanchery, Thrissur, <strong>Ice Spot Varavoor</strong> is our primary manufacturing factory and central franchise headquarters, dedicated to crafting delicious handcrafted ice creams, refreshing shakes, and artisanal ice candies.
          </p>
          <p>
            As the heart of Ice Spot&apos;s production, our Varavoor factory crafts our signature 10 real fruit sticks and supplies parlours across Kerala with authentic recipes, rich cream, and pure, sun-ripened ingredients.
          </p>

          <div className="about-badges-grid">
            <div className="about-badge">
              <span className="badge-icon">🏭</span>
              <div className="badge-text">
                <h4>Central Production</h4>
                <span>State-of-the-art facility</span>
              </div>
            </div>
            <div className="about-badge">
              <span className="badge-icon">🍓</span>
              <div className="badge-text">
                <h4>Fresh Flavours</h4>
                <span>Real fruit &amp; dry fruit blends</span>
              </div>
            </div>
            <div className="about-badge">
              <span className="badge-icon">📍</span>
              <div className="badge-text">
                <h4>Factory Location</h4>
                <span>Varavoor, Wadakkanchery</span>
              </div>
            </div>
            <div className="about-badge">
              <span className="badge-icon">✨</span>
              <div className="badge-text">
                <h4>Moderate Pricing</h4>
                <span>Quality desserts for everyone</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
