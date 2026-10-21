import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { OrderModalProvider } from "@/context/OrderModalContext";
import OrderModal from "@/components/ui/OrderModal";

export const metadata: Metadata = {
  title: "Ice Spot Varavoor | Handcrafted Ice Creams & Production Factory",
  description:
    "Discover handcrafted dessert pleasures at Ice Spot Varavoor, Thrissur. Main manufacturing factory and central hub producing 10 real fruit sticks, Sharjah shakes, authentic Falooda, and artisanal ice candies.",
  keywords: [
    "Ice Spot Varavoor",
    "ice cream factory Kerala",
    "ice cream Thrissur",
    "Sharjah shake Varavoor",
    "Falooda Thrissur",
    "ice candy factory",
    "dessert parlour",
    "Ice Spot Ollur",
  ],
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🍦</text></svg>",
  },
  openGraph: {
    title: "Ice Spot Varavoor | Handcrafted Ice Creams & Production Factory",
    description:
      "Handcrafted dessert pleasures, 10 real fruit sticks, Sharjah shakes, authentic Falooda, and artisanal ice candies directly from the Varavoor manufacturing factory.",
    url: "https://icespot.in",
    siteName: "Ice Spot Varavoor",
    locale: "en_IN",
    type: "website",
  },
};

import PublicLayoutWrapper from "@/components/layout/PublicLayoutWrapper";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <OrderModalProvider>
          <PublicLayoutWrapper>{children}</PublicLayoutWrapper>
        </OrderModalProvider>
      </body>
    </html>
  );
}
