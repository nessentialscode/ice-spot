"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { FLAVOURS } from "@/lib/data/flavours";
import { Flavour } from "@/types";

export default function SticksWheel() {
  const [activeFlavour, setActiveFlavour] = useState<Flavour | null>(null);
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const handleActivate = (flavour: Flavour) => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    setActiveFlavour(flavour);
  };

  const handleDeactivate = () => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => {
      setActiveFlavour(null);
    }, 180);
  };

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (stageRef.current && !stageRef.current.contains(e.target as Node)) {
        setActiveFlavour(null);
      }
    };
    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className={`sticks-wheel-stage ${activeFlavour ? "has-active" : ""}`}
      id="sticksWheelStage"
      aria-label="Ten signature Icespot ice cream sticks arranged in a circle"
    >
      {/* Subtle Icespot Wordmark & Aura Behind Sticks */}
      <div className="wheel-backdrop-aura" aria-hidden="true">
        <div className="wheel-aura-glow"></div>
        <div className="wheel-center-wordmark">
          <span className="wm-text">icespot</span>
          <span className="wm-sub">Live in Freshness</span>
        </div>
      </div>

      {/* Interactive Central Flavor Indicator (Updates on hover / tap) */}
      <div
        className={`wheel-center-hub ${activeFlavour ? "is-active" : ""}`}
        id="wheelCenterHub"
        aria-live="polite"
      >
        <span
          className="hub-badge"
          id="hubBadge"
          style={
            activeFlavour
              ? {
                  borderColor: activeFlavour.color,
                  boxShadow: `0 0 16px ${activeFlavour.color}99`,
                }
              : undefined
          }
        >
          {activeFlavour ? activeFlavour.name : "Artisanal Sticks"}
        </span>
        <p className="hub-desc" id="hubDesc">
          {activeFlavour ? activeFlavour.tagline : "Hover or tap any stick to explore"}
        </p>
      </div>

      {/* The 10 Interactive Ice Cream Sticks */}
      <div className="sticks-ring" id="sticksRing">
        {FLAVOURS.map((item, idx) => {
          const isSelected = activeFlavour?.id === item.id;
          return (
            <div
              key={item.id}
              className={`stick-item ${isSelected ? "is-selected" : ""}`}
              id={`stick-${item.id}`}
              data-index={idx}
              data-flavor={item.name}
              data-tagline={item.tagline}
              data-color={item.color}
              data-glow={item.glow}
              style={{
                left: item.position.left,
                top: item.position.top,
                width: item.position.width,
                height: item.position.height,
                // Pass CSS variables
                ["--stick-color" as string]: item.color,
                ["--stick-glow" as string]: item.glow,
              }}
              role="button"
              tabIndex={0}
              aria-label={`${item.name}: ${item.tagline}`}
              onMouseEnter={() => handleActivate(item)}
              onMouseLeave={handleDeactivate}
              onFocus={() => handleActivate(item)}
              onBlur={handleDeactivate}
              onClick={(e) => {
                e.stopPropagation();
                handleActivate(item);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleActivate(item);
                } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  const nextFlavour = FLAVOURS[(idx + 1) % FLAVOURS.length];
                  handleActivate(nextFlavour);
                  document.getElementById(`stick-${nextFlavour.id}`)?.focus();
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const prevFlavour = FLAVOURS[(idx - 1 + FLAVOURS.length) % FLAVOURS.length];
                  handleActivate(prevFlavour);
                  document.getElementById(`stick-${prevFlavour.id}`)?.focus();
                }
              }}
            >
              <div className="stick-hit-area">
                <Image
                  src={item.stickImg}
                  alt={`${item.name} ice cream stick`}
                  className="stick-product-img"
                  width={220}
                  height={320}
                  priority
                  draggable={false}
                />
              </div>
              <div className="stick-floating-tooltip" aria-hidden="true">
                {item.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
