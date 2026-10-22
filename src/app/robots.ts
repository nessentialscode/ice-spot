import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://icespot.in";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/flavours", "/locations", "/contact"],
        disallow: ["/admin/", "/api/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
