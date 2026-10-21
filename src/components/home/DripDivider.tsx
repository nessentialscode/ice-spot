import React from "react";
import Image from "next/image";

export default function DripDivider() {
  return (
    <div className="dripping-divider-wrap" aria-hidden="true">
      <Image
        src="/assets/drips-reference-transparent.png"
        alt=""
        width={1920}
        height={320}
        className="dripping-divider-img"
        priority
      />
    </div>
  );
}
