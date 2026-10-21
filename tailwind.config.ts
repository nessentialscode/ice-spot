import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "hero-red": "#D83162",
        "hero-red-deep": "#B51B47",
        "hero-crimson": "#8E1035",
        "hero-glow": "#FF6584",
        "rose-blush": "#FF9EBB",
        "rose-soft": "#FDE8ED",
        "rose-deep": "#6D0C27",
        "green-pista": "#2E8B57",
        "gold-kesar": "#F5A623",
        "berry-blue": "#3A4F82",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["'Outfit'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
