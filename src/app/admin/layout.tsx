"use client";

import React, { ReactNode } from "react";
import { AdminProvider } from "@/context/AdminContext";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminProvider>{children}</AdminProvider>;
}
