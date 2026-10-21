"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { FLAVOURS } from "@/lib/data/flavours";
import { useOrderModal } from "@/context/OrderModalContext";

export default function FlavoursShowcase() {
  const { openOrderModal } = useOrderModal();
  const [activeIdx, setActiveIdx] = useState(2); // Start at Alphonso Mango (index 2)

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Physics animation state refs
  const currentPosRef = useRef(2);
  const targetPosRef = useRef(2);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startPosRef = useRef(2);
  const lastXRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityXRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const getMetrics = useCallback(() => {
    if (typeof window === "undefined") {
      return { spacingX: 210, apexY: 42, angleStep: 9.4, curveDrop: 15, maxVisibleU: 4.4, itemWidth: 145, itemHeight: 345 };
    }
    const w = window.innerWidth;
    if (w <= 480) {
      return { spacingX: 110, apexY: 25, angleStep: 13.0, curveDrop: 24, maxVisibleU: 2.8, itemWidth: 100, itemHeight: 250 };
    } else if (w <= 768) {
      return { spacingX: 140, apexY: 30, angleStep: 11.5, curveDrop: 20, maxVisibleU: 3.3, itemWidth: 115, itemHeight: 285 };
    } else if (w <= 1024) {
      return { spacingX: 175, apexY: 36, angleStep: 10.2, curveDrop: 17, maxVisibleU: 3.8, itemWidth: 130, itemHeight: 315 };
    } else {
      return { spacingX: 210, apexY: 42, angleStep: 9.4, curveDrop: 15, maxVisibleU: 4.4, itemWidth: 145, itemHeight: 345 };
    }
  }, []);

  const renderPositions = useCallback(() => {
    const metrics = getMetrics();
    const maxU = metrics.maxVisibleU;
    const current = currentPosRef.current;

    itemsRef.current.forEach((item, idx) => {
      if (!item) return;
      const u = idx - current;
      const absU = Math.abs(u);

      if (absU > maxU + 0.9) {
        item.style.visibility = "hidden";
        item.style.opacity = "0";
        item.style.pointerEvents = "none";
        return;
      }

      item.style.visibility = "visible";
      item.style.pointerEvents = "auto";

      const x = u * metrics.spacingX;
      const y = metrics.apexY + metrics.curveDrop * (u * u);
      const rotation = u * metrics.angleStep;
      const scale = Math.max(0.82, 1 - absU * 0.045);
      const zIndex = Math.round(150 - absU * 15);

      let opacity = 1;
      if (absU > maxU) {
        opacity = Math.max(0, 1 - (absU - maxU) / 0.9);
      }

      item.style.zIndex = zIndex.toString();
      item.style.opacity = opacity.toFixed(3);
      item.style.transform = `translate3d(calc(-50% + ${x.toFixed(1)}px), ${y.toFixed(1)}px, 0) rotate(${rotation.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    });

    const roundedIdx = Math.max(0, Math.min(FLAVOURS.length - 1, Math.round(current)));
    setActiveIdx((prev) => (prev !== roundedIdx ? roundedIdx : prev));
  }, [getMetrics]);

  const animate = useCallback(() => {
    const diff = targetPosRef.current - currentPosRef.current;
    if (Math.abs(diff) > 0.001) {
      currentPosRef.current += diff * 0.12;
      renderPositions();
      rafIdRef.current = requestAnimationFrame(animate);
    } else {
      currentPosRef.current = targetPosRef.current;
      renderPositions();
      rafIdRef.current = null;
    }
  }, [renderPositions]);

  const startAnimation = useCallback(() => {
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(animate);
    }
  }, [animate]);

  const goToIndex = useCallback(
    (idx: number) => {
      targetPosRef.current = Math.max(0, Math.min(FLAVOURS.length - 1, idx));
      startAnimation();
    },
    [startAnimation]
  );

  useEffect(() => {
    const handleResize = () => {
      const metrics = getMetrics();
      itemsRef.current.forEach((it) => {
        if (it) {
          it.style.setProperty("--item-w", `${metrics.itemWidth}px`);
          it.style.setProperty("--item-h", `${metrics.itemHeight}px`);
        }
      });
      renderPositions();
    };

    handleResize();
    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [getMetrics, renderPositions]);

  // Pointer drag and touch interactions
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      isDraggingRef.current = true;
      hasMovedRef.current = false;
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      startPosRef.current = targetPosRef.current;
      lastXRef.current = e.clientX;
      lastTimeRef.current = performance.now();
      velocityXRef.current = 0;

      viewport.classList.add("is-dragging");
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch (_) {}
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - startXRef.current;
      const dy = e.clientY - startYRef.current;

      if (!hasMovedRef.current && Math.hypot(dx, dy) > 6) {
        hasMovedRef.current = true;
      }

      const now = performance.now();
      const dt = Math.max(1, now - lastTimeRef.current);
      velocityXRef.current = (e.clientX - lastXRef.current) / dt;
      lastXRef.current = e.clientX;
      lastTimeRef.current = now;

      const metrics = getMetrics();
      const deltaIndex = -dx / metrics.spacingX;
      targetPosRef.current = Math.max(-0.4, Math.min(FLAVOURS.length - 0.6, startPosRef.current + deltaIndex));
      startAnimation();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      viewport.classList.remove("is-dragging");

      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch (_) {}

      if (hasMovedRef.current) {
        let flickOffset = 0;
        if (Math.abs(velocityXRef.current) > 0.35) {
          flickOffset = -velocityXRef.current * 0.45;
        }
        let nextTarget = Math.round(targetPosRef.current + flickOffset);
        targetPosRef.current = Math.max(0, Math.min(FLAVOURS.length - 1, nextTarget));
        startAnimation();
      }
    };

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("pointercancel", onPointerUp);

    return () => {
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUp);
      viewport.removeEventListener("pointercancel", onPointerUp);
    };
  }, [getMetrics, startAnimation]);

  const currentFlavour = FLAVOURS[activeIdx] || FLAVOURS[0];

  return (
    <section className="flavours-showcase-section" id="flavours">
      <div className="showcase-header">
        <span className="showcase-badge">Signature Ice Creams</span>
        <h2 className="showcase-title">Flavours</h2>
        <p className="showcase-subtitle">
          Discover your next favourite &bull; Horizontally curved showcase of 10 handcrafted sticks
        </p>
      </div>

      {/* Semicircular Curved Showcase Stage */}
      <div
        className="semicircle-stage"
        id="semicircleStage"
        aria-label="Semicircular curved horizontal scrolling showcase of Icespot ice creams"
      >
        {/* Navigation Controls: Left & Right Glassmorphic Arrows */}
        <button
          className={`showcase-nav-arrow arrow-prev ${activeIdx <= 0 ? "is-disabled" : ""}`}
          id="showcasePrevBtn"
          aria-label="Previous flavour"
          title="Previous flavour"
          disabled={activeIdx <= 0}
          onClick={() => goToIndex(activeIdx - 1)}
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            stroke="currentColor"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        <button
          className={`showcase-nav-arrow arrow-next ${activeIdx >= FLAVOURS.length - 1 ? "is-disabled" : ""}`}
          id="showcaseNextBtn"
          aria-label="Next flavour"
          title="Next flavour"
          disabled={activeIdx >= FLAVOURS.length - 1}
          onClick={() => goToIndex(activeIdx + 1)}
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            stroke="currentColor"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>

        {/* Viewport & Semicircular Track */}
        <div className="semicircle-viewport" id="semicircleViewport" ref={viewportRef}>
          <div className="semicircle-track" id="semicircleTrack" ref={trackRef}>
            {FLAVOURS.map((flavour, idx) => {
              const isCenter = idx === activeIdx;
              return (
                <div
                  key={flavour.id}
                  ref={(el) => {
                    itemsRef.current[idx] = el;
                  }}
                  className={`showcase-item ${isCenter ? "is-center-item" : ""}`}
                  id={`showcase-item-${idx}`}
                  data-index={idx}
                  data-flavor={flavour.name}
                  data-tagline={flavour.tagline}
                  data-color={flavour.color}
                  data-glow={flavour.glow}
                  data-category={flavour.category}
                  style={{
                    ["--flv-color" as string]: flavour.color,
                    ["--flv-glow" as string]: flavour.glow,
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${flavour.name}: ${flavour.tagline}`}
                  onClick={() => {
                    if (!hasMovedRef.current) {
                      goToIndex(idx);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goToIndex(idx);
                    }
                  }}
                >
                  <div className="showcase-card">
                    <div className="showcase-img-wrap">
                      <Image
                        src={flavour.showcaseImg}
                        alt={`${flavour.name} packaged ice cream`}
                        className="showcase-product-img"
                        width={260}
                        height={380}
                        draggable={false}
                        priority={idx < 4}
                      />
                    </div>
                    <div className="showcase-label-chip">{flavour.name}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Flavour Info Hub Below Arc */}
      <div className="showcase-hub-card" id="showcaseHubCard" aria-live="polite">
        <span
          className="hub-category-pill"
          id="hubCategoryPill"
          style={{
            borderColor: `${currentFlavour.color}44`,
            color: currentFlavour.color,
            background: `${currentFlavour.color}14`,
          }}
        >
          {currentFlavour.category}
        </span>
        <h3 className="hub-title" id="hubTitleText">
          {currentFlavour.name}
        </h3>
        <p className="hub-description" id="hubDescText">
          {currentFlavour.tagline}
        </p>
        <div className="hub-footer">
          <button
            className="btn-card-inquire open-order-modal"
            id="hubInquireBtn"
            onClick={() => openOrderModal(currentFlavour.name)}
          >
            Order / Inquire
          </button>
        </div>
      </div>

      {/* Interactive Dots Pagination */}
      <div className="showcase-dots" id="showcaseDots" role="tablist" aria-label="Flavour carousel pagination">
        {FLAVOURS.map((f, idx) => (
          <button
            key={f.id}
            className={`showcase-dot-btn ${idx === activeIdx ? "active" : ""}`}
            data-index={idx}
            role="tab"
            aria-selected={idx === activeIdx}
            aria-label={`Go to ${f.name}`}
            title={f.name}
            onClick={() => goToIndex(idx)}
          />
        ))}
      </div>
    </section>
  );
}
