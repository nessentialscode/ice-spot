
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Isolate development and production build artifacts.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

  images: {
    unoptimized: true,
  },
};

export default nextConfig;
