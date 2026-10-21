import React from "react";
import { REVIEWS } from "@/lib/data/reviews";

export default function ReviewsSection() {
  return (
    <section className="reviews-section" id="reviews">
      <div className="section-intro">
        <span className="section-tag">Customer Words</span>
        <h2 className="section-title">What Our Visitors Say</h2>
        <p className="section-subtitle">
          Real experiences shared by guests visiting our Varavoor factory hub &amp; franchise parlours.
        </p>
      </div>

      <div className="reviews-grid">
        {REVIEWS.map((rev) => (
          <div key={rev.id} className="review-card">
            <span className="review-quote-mark">&ldquo;</span>
            <p className="review-text">{rev.text}</p>
            <div className="review-author">
              <div className="author-avatar" aria-hidden="true">★</div>
              <div className="author-info">
                <h4>{rev.author}</h4>
                <span>{rev.source} &bull; {rev.rating}/5 Stars</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
