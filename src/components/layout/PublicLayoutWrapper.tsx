"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import OrderModal from "@/components/ui/OrderModal";

export default function PublicLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  if (isAdmin) {
    // Admin routes use their own isolated layout and shell
    return <>{children}</>;
  }

  // Public website layout
  return (
    <div className="page-wrapper">
      <Header />
      <main>{children}</main>
      <Footer />
      <OrderModal />
    </div>
  );
}
