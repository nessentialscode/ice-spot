"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface OrderModalContextType {
  isOpen: boolean;
  selectedItem: string;
  openOrderModal: (item?: string) => void;
  closeOrderModal: () => void;
}

const OrderModalContext = createContext<OrderModalContextType | undefined>(undefined);

export function OrderModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState("Ice Cream Special");

  const openOrderModal = useCallback((item = "Ice Cream Special") => {
    setSelectedItem(item);
    setIsOpen(true);
  }, []);

  const closeOrderModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <OrderModalContext.Provider value={{ isOpen, selectedItem, openOrderModal, closeOrderModal }}>
      {children}
    </OrderModalContext.Provider>
  );
}

export function useOrderModal() {
  const context = useContext(OrderModalContext);
  if (!context) {
    throw new Error("useOrderModal must be used within an OrderModalProvider");
  }
  return context;
}
