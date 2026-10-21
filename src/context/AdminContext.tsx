"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  AdminRole,
  AdminOrder,
  AdminProduct,
  DispatchBatch,
  AdminUserAccount,
  DiscrepancyReport,
  InventoryAdjustmentLog,
  OrderItem,
  StopDeliveryStatus,
  OrderStatus
} from "@/types/admin";
import {
  INITIAL_ADMIN_PRODUCTS,
  INITIAL_ADMIN_ORDERS,
  INITIAL_DISPATCH_BATCHES,
  INITIAL_ADMIN_USERS,
  INITIAL_DISCREPANCIES,
  INITIAL_INVENTORY_LOGS
} from "@/lib/data/adminMockData";
import { BRANCHES } from "@/lib/data/branches";

interface ToastNotification {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface AdminContextType {
  demoRole: AdminRole;
  setDemoRole: (role: AdminRole) => void;
  demoBranchId: string;
  setDemoBranchId: (branchId: string) => void;
  demoDriverId: string;
  setDemoDriverId: (driverId: string) => void;

  orders: AdminOrder[];
  products: AdminProduct[];
  dispatches: DispatchBatch[];
  users: AdminUserAccount[];
  discrepancies: DiscrepancyReport[];
  inventoryLogs: InventoryAdjustmentLog[];
  toast: ToastNotification | null;

  showToast: (message: string, type?: "success" | "error" | "info") => void;
  submitOrder: (data: {
    branchId: string;
    items: OrderItem[];
    notes?: string;
    requestedDeliveryDate: string;
  }) => string;
  saveOrderDraft: (data: {
    branchId: string;
    items: OrderItem[];
    notes?: string;
  }) => string;
  cancelOrder: (orderId: string, reason: string) => void;
  requestAmendment: (orderId: string, amendmentNotes: string) => void;
  approveOrder: (
    orderId: string,
    approvedPacksMap: Record<string, number>,
    factoryNotes?: string
  ) => void;
  rejectOrder: (orderId: string, reason: string) => void;
  returnOrderForCorrection: (orderId: string, notes: string) => void;
  createDispatchBatch: (data: {
    vehicleNumber: string;
    driverId: string;
    driverName: string;
    orderIds: string[];
    notes?: string;
  }) => string;
  updateDispatchLoadingChecklist: (
    dispatchId: string,
    loadedMap: Record<string, number>
  ) => void;
  markDispatchDeparted: (dispatchId: string) => void;
  updateDeliveryStop: (
    dispatchId: string,
    orderId: string,
    status: StopDeliveryStatus,
    deliveredUnits?: number,
    notes?: string,
    failureReason?: string
  ) => void;
  receiveShipment: (
    orderId: string,
    receivedUnitsMap: Record<string, number>,
    missingMap: Record<string, number>,
    damagedMap: Record<string, number>,
    discrepancyNotes?: string
  ) => void;
  adjustInventory: (
    productId: string,
    changeAmount: number,
    reason: "Production Output" | "Damaged Stock" | "Inventory Audit" | "Manual Correction"
  ) => void;
  toggleProductActive: (productId: string) => void;
  saveProduct: (product: AdminProduct) => void;
  resetDemoData: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

const STORAGE_KEY = "icespot_admin_demo_state_v1";

export function AdminProvider({ children }: { children: ReactNode }) {
  const [demoRole, setDemoRole] = useState<AdminRole>("super-admin");
  const [demoBranchId, setDemoBranchId] = useState<string>("ollur-branch");
  const [demoDriverId, setDemoDriverId] = useState<string>("usr-del-1");

  const [orders, setOrders] = useState<AdminOrder[]>(INITIAL_ADMIN_ORDERS);
  const [products, setProducts] = useState<AdminProduct[]>(INITIAL_ADMIN_PRODUCTS);
  const [dispatches, setDispatches] = useState<DispatchBatch[]>(INITIAL_DISPATCH_BATCHES);
  const [users, setUsers] = useState<AdminUserAccount[]>(INITIAL_ADMIN_USERS);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyReport[]>(INITIAL_DISCREPANCIES);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryAdjustmentLog[]>(INITIAL_INVENTORY_LOGS);
  const [toast, setToast] = useState<ToastNotification | null>(null);

  // Load from localStorage once on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.orders) setOrders(parsed.orders);
        if (parsed.products) setProducts(parsed.products);
        if (parsed.dispatches) setDispatches(parsed.dispatches);
        if (parsed.users) setUsers(parsed.users);
        if (parsed.discrepancies) setDiscrepancies(parsed.discrepancies);
        if (parsed.inventoryLogs) setInventoryLogs(parsed.inventoryLogs);
        if (parsed.demoRole) setDemoRole(parsed.demoRole);
        if (parsed.demoBranchId) setDemoBranchId(parsed.demoBranchId);
        if (parsed.demoDriverId) setDemoDriverId(parsed.demoDriverId);
      }
    } catch (e) {
      console.warn("Failed to read localStorage demo state", e);
    }
  }, []);

  // Save changes to localStorage
  const persistState = (newPartial: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    try {
      const current = {
        orders,
        products,
        dispatches,
        users,
        discrepancies,
        inventoryLogs,
        demoRole,
        demoBranchId,
        demoDriverId,
        ...newPartial
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {
      console.warn("Failed to persist demo state", e);
    }
  };

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4500);
  };

  const resetDemoData = () => {
    setOrders(INITIAL_ADMIN_ORDERS);
    setProducts(INITIAL_ADMIN_PRODUCTS);
    setDispatches(INITIAL_DISPATCH_BATCHES);
    setUsers(INITIAL_ADMIN_USERS);
    setDiscrepancies(INITIAL_DISCREPANCIES);
    setInventoryLogs(INITIAL_INVENTORY_LOGS);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    showToast("Demonstration data reset to initial seed values.", "info");
  };

  // 1. Submit Weekly Order
  const submitOrder = (data: {
    branchId: string;
    items: OrderItem[];
    notes?: string;
    requestedDeliveryDate: string;
  }): string => {
    const branch = BRANCHES.find((b) => b.id === data.branchId);
    const branchName = branch ? branch.name : "Branch";
    const nextNum = 105 + orders.length;
    const orderNumber = `ORD-2026-${nextNum}`;
    const orderId = `ord-${nextNum}`;

    const totalUnitsRequested = data.items.reduce(
      (sum, item) => sum + item.requestedPacks * (products.find((p) => p.id === item.productId)?.unitsPerPack || 24),
      0
    );

    const now = new Date();
    const timestamp = now.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const newOrder: AdminOrder = {
      id: orderId,
      orderNumber,
      branchId: data.branchId,
      branchName,
      district: branch?.district || "Thrissur",
      submittedAt: timestamp,
      requestedDeliveryDate: data.requestedDeliveryDate,
      status: "submitted",
      totalUnitsRequested,
      totalUnitsApproved: 0,
      branchNotes: data.notes,
      items: data.items.map((it) => {
        const prod = products.find((p) => p.id === it.productId);
        const unitsPerPack = prod?.unitsPerPack || 24;
        return {
          ...it,
          requestedUnits: it.requestedPacks * unitsPerPack,
          approvedPacks: 0,
          approvedUnits: 0
        };
      }),
      timeline: [
        {
          id: `tl-${orderId}-1`,
          timestamp,
          status: "submitted",
          actorName: "Branch Admin",
          actorRole: "Branch Admin",
          note: `Submitted weekly order with ${data.items.length} product lines (${totalUnitsRequested} units)`
        }
      ]
    };

    const updated = [newOrder, ...orders];
    setOrders(updated);
    persistState({ orders: updated });
    showToast(`Order ${orderNumber} submitted successfully to Varavoor Factory!`, "success");
    return orderId;
  };

  // 2. Save Draft Order
  const saveOrderDraft = (data: {
    branchId: string;
    items: OrderItem[];
    notes?: string;
  }): string => {
    const branch = BRANCHES.find((b) => b.id === data.branchId);
    const nextNum = 200 + orders.length;
    const orderNumber = `DFT-2026-${nextNum}`;
    const orderId = `dft-${nextNum}`;

    const totalUnitsRequested = data.items.reduce(
      (sum, item) => sum + item.requestedPacks * (products.find((p) => p.id === item.productId)?.unitsPerPack || 24),
      0
    );

    const now = new Date();
    const timestamp = now.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const newOrder: AdminOrder = {
      id: orderId,
      orderNumber,
      branchId: data.branchId,
      branchName: branch?.name || "Branch",
      district: branch?.district || "Thrissur",
      submittedAt: timestamp,
      requestedDeliveryDate: "Pending Submission",
      status: "draft",
      totalUnitsRequested,
      totalUnitsApproved: 0,
      branchNotes: data.notes,
      items: data.items,
      timeline: [
        {
          id: `tl-${orderId}-1`,
          timestamp,
          status: "draft",
          actorName: "Branch Admin",
          actorRole: "Branch Admin",
          note: "Draft order saved locally"
        }
      ]
    };

    const updated = [newOrder, ...orders];
    setOrders(updated);
    persistState({ orders: updated });
    showToast(`Draft ${orderNumber} saved. You can submit when ready.`, "info");
    return orderId;
  };

  // 3. Cancel Order (only before approval)
  const cancelOrder = (orderId: string, reason: string) => {
    const updated = orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      const now = new Date();
      const timestamp = now.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
      return {
        ...ord,
        status: "cancelled" as OrderStatus,
        cancelReason: reason,
        timeline: [
          ...ord.timeline,
          {
            id: `tl-${orderId}-${Date.now()}`,
            timestamp,
            status: "cancelled" as OrderStatus,
            actorName: demoRole === "super-admin" ? "Factory Admin" : "Branch Admin",
            actorRole: demoRole,
            note: `Cancelled. Reason: ${reason}`
          }
        ]
      };
    });
    setOrders(updated);
    persistState({ orders: updated });
    showToast(`Order has been marked cancelled.`, "info");
  };

  // 4. Request Amendment (Post-Approval)
  const requestAmendment = (orderId: string, amendmentNotes: string) => {
    const updated = orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      const now = new Date();
      const timestamp = now.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
      return {
        ...ord,
        status: "amendment-requested" as OrderStatus,
        amendmentNotes,
        timeline: [
          ...ord.timeline,
          {
            id: `tl-${orderId}-${Date.now()}`,
            timestamp,
            status: "amendment-requested" as OrderStatus,
            actorName: "Branch Admin",
            actorRole: "branch-admin",
            note: `Amendment Requested: ${amendmentNotes}`
          }
        ]
      };
    });
    setOrders(updated);
    persistState({ orders: updated });
    showToast("Amendment request sent to Varavoor Factory dispatch desk.", "success");
  };

  // 5. Approve Order (Super Admin)
  const approveOrder = (
    orderId: string,
    approvedPacksMap: Record<string, number>,
    factoryNotes?: string
  ) => {
    let totalApprovedUnits = 0;
    const now = new Date();
    const timestamp = now.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const updatedOrders = orders.map((ord) => {
      if (ord.id !== orderId) return ord;

      const updatedItems = ord.items.map((item) => {
        const approvedPacks =
          approvedPacksMap[item.productId] !== undefined
            ? approvedPacksMap[item.productId]
            : item.requestedPacks;
        const prod = products.find((p) => p.id === item.productId);
        const unitsPerPack = prod?.unitsPerPack || 24;
        const approvedUnits = approvedPacks * unitsPerPack;
        totalApprovedUnits += approvedUnits;

        return {
          ...item,
          approvedPacks,
          approvedUnits
        };
      });

      return {
        ...ord,
        status: "approved" as OrderStatus,
        factoryNotes: factoryNotes || ord.factoryNotes,
        totalUnitsApproved: totalApprovedUnits,
        items: updatedItems,
        timeline: [
          ...ord.timeline,
          {
            id: `tl-${orderId}-${Date.now()}`,
            timestamp,
            status: "approved" as OrderStatus,
            actorName: "M. Faizal (Factory Mgr)",
            actorRole: "super-admin",
            note: factoryNotes
              ? `Approved (${totalApprovedUnits} units). Note: ${factoryNotes}`
              : `Order approved in full (${totalApprovedUnits} units). Stock reserved.`
          }
        ]
      };
    });

    // Update product reserved stock
    const targetOrder = orders.find((o) => o.id === orderId);
    let updatedProducts = [...products];
    if (targetOrder) {
      updatedProducts = products.map((prod) => {
        const approvedPacks = approvedPacksMap[prod.id];
        if (approvedPacks) {
          const additionalReserved = approvedPacks * prod.unitsPerPack;
          return {
            ...prod,
            reservedStock: prod.reservedStock + additionalReserved
          };
        }
        return prod;
      });
      setProducts(updatedProducts);
    }

    setOrders(updatedOrders);
    persistState({ orders: updatedOrders, products: updatedProducts });
    showToast(`Order approved. Quantities locked and reserved in cold storage.`, "success");
  };

  // 6. Reject Order
  const rejectOrder = (orderId: string, reason: string) => {
    const now = new Date();
    const timestamp = now.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const updated = orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      return {
        ...ord,
        status: "cancelled" as OrderStatus,
        factoryNotes: `Rejected by factory: ${reason}`,
        timeline: [
          ...ord.timeline,
          {
            id: `tl-${orderId}-${Date.now()}`,
            timestamp,
            status: "cancelled" as OrderStatus,
            actorName: "M. Faizal",
            actorRole: "super-admin",
            note: `Rejected by factory: ${reason}`
          }
        ]
      };
    });
    setOrders(updated);
    persistState({ orders: updated });
    showToast(`Order has been rejected with reason recorded.`, "info");
  };

  // 7. Return for correction
  const returnOrderForCorrection = (orderId: string, notes: string) => {
    const now = new Date();
    const timestamp = now.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const updated = orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      return {
        ...ord,
        status: "under-review" as OrderStatus,
        factoryNotes: `Returned for correction: ${notes}`,
        timeline: [
          ...ord.timeline,
          {
            id: `tl-${orderId}-${Date.now()}`,
            timestamp,
            status: "under-review" as OrderStatus,
            actorName: "M. Faizal",
            actorRole: "super-admin",
            note: `Returned for correction: ${notes}`
          }
        ]
      };
    });
    setOrders(updated);
    persistState({ orders: updated });
    showToast(`Order returned to branch with feedback note.`, "info");
  };

  // 8. Create Dispatch Batch
  const createDispatchBatch = (data: {
    vehicleNumber: string;
    driverId: string;
    driverName: string;
    orderIds: string[];
    notes?: string;
  }): string => {
    const nextNum = 91 + dispatches.length;
    const manifestNumber = `DSP-VRV-${nextNum.toString().padStart(3, "0")}`;
    const dispatchId = `dsp-${nextNum}`;

    const driverUser = users.find((u) => u.id === data.driverId);
    const selectedOrders = orders.filter((o) => data.orderIds.includes(o.id));

    let totalUnits = 0;
    const stops = selectedOrders.map((ord, idx) => {
      const branch = BRANCHES.find((b) => b.id === ord.branchId);
      const units = ord.items.reduce((s, it) => s + (it.approvedUnits || it.requestedUnits), 0);
      totalUnits += units;

      return {
        id: `stop-${dispatchId}-${idx + 1}`,
        orderId: ord.id,
        orderNumber: ord.orderNumber,
        branchId: ord.branchId,
        branchName: ord.branchName,
        district: ord.district,
        address: branch?.location || "Branch Address, Kerala",
        phone: branch?.phone || "+91 94470 00000",
        sequence: idx + 1,
        items: ord.items.map((it) => ({
          ...it,
          packedUnits: it.approvedUnits || it.requestedUnits
        })),
        status: "pending" as StopDeliveryStatus
      };
    });

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    const newDispatch: DispatchBatch = {
      id: dispatchId,
      manifestNumber,
      vehicleNumber: data.vehicleNumber,
      driverId: data.driverId,
      driverName: data.driverName,
      driverPhone: driverUser?.phone || "+91 98460 00000",
      dispatchDate: today,
      status: "loading",
      orderIds: data.orderIds,
      totalUnits,
      notes: data.notes,
      stops
    };

    // Update order statuses to 'preparation' or 'ready-for-dispatch'
    const updatedOrders = orders.map((ord) => {
      if (data.orderIds.includes(ord.id)) {
        return {
          ...ord,
          status: "ready-for-dispatch" as OrderStatus,
          assignedDispatchId: dispatchId,
          timeline: [
            ...ord.timeline,
            {
              id: `tl-${ord.id}-${Date.now()}`,
              timestamp: now.toLocaleDateString("en-IN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
              }),
              status: "ready-for-dispatch" as OrderStatus,
              actorName: "Dispatch Desk",
              actorRole: "super-admin",
              note: `Batched into manifest ${manifestNumber} (${data.vehicleNumber})`
            }
          ]
        };
      }
      return ord;
    });

    const updatedDispatches = [newDispatch, ...dispatches];
    setDispatches(updatedDispatches);
    setOrders(updatedOrders);
    persistState({ dispatches: updatedDispatches, orders: updatedOrders });
    showToast(`Dispatch manifest ${manifestNumber} generated with ${stops.length} stops!`, "success");
    return dispatchId;
  };

  // 9. Update Loading Checklist (Delivery Staff)
  const updateDispatchLoadingChecklist = (
    dispatchId: string,
    loadedMap: Record<string, number>
  ) => {
    const updatedDispatches = dispatches.map((dsp) => {
      if (dsp.id !== dispatchId) return dsp;

      const updatedStops = dsp.stops.map((stop) => {
        const updatedItems = stop.items.map((item) => {
          const key = `${stop.id}_${item.productId}`;
          const loadedQty = loadedMap[key] !== undefined ? loadedMap[key] : (item.packedUnits || 0);
          return {
            ...item,
            packedUnits: loadedQty
          };
        });
        return {
          ...stop,
          items: updatedItems
        };
      });

      return {
        ...dsp,
        status: "ready" as const,
        stops: updatedStops
      };
    });

    setDispatches(updatedDispatches);
    persistState({ dispatches: updatedDispatches });
    showToast("Loading checklist verified and saved.", "success");
  };

  // 10. Mark Dispatch Departed
  const markDispatchDeparted = (dispatchId: string) => {
    const now = new Date();
    const timestamp = now.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    let targetOrderIds: string[] = [];

    const updatedDispatches = dispatches.map((dsp) => {
      if (dsp.id !== dispatchId) return dsp;
      targetOrderIds = dsp.orderIds;
      return {
        ...dsp,
        status: "in-transit" as const,
        departedAt: timestamp,
        stops: dsp.stops.map((s) => ({ ...s, status: "in-transit" as StopDeliveryStatus }))
      };
    });

    const updatedOrders = orders.map((ord) => {
      if (targetOrderIds.includes(ord.id)) {
        return {
          ...ord,
          status: "dispatched" as OrderStatus,
          timeline: [
            ...ord.timeline,
            {
              id: `tl-${ord.id}-${Date.now()}`,
              timestamp,
              status: "dispatched" as OrderStatus,
              actorName: "Delivery Staff",
              actorRole: "delivery-staff",
              note: "Vehicle departed central factory. Goods in transit."
            }
          ]
        };
      }
      return ord;
    });

    setDispatches(updatedDispatches);
    setOrders(updatedOrders);
    persistState({ dispatches: updatedDispatches, orders: updatedOrders });
    showToast("Dispatch marked as Departed. All stops are now In-Transit.", "success");
  };

  // 11. Update Delivery Stop (Delivery Staff)
  const updateDeliveryStop = (
    dispatchId: string,
    orderId: string,
    status: StopDeliveryStatus,
    deliveredUnits?: number,
    notes?: string,
    failureReason?: string
  ) => {
    const now = new Date();
    const timestamp = now.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const updatedDispatches = dispatches.map((dsp) => {
      if (dsp.id !== dispatchId) return dsp;

      const updatedStops = dsp.stops.map((stop) => {
        if (stop.orderId === orderId) {
          return {
            ...stop,
            status,
            deliveredUnits: deliveredUnits !== undefined ? deliveredUnits : stop.deliveredUnits,
            deliveryNotes: notes,
            failureReason: failureReason,
            completedAt: status === "delivered" || status === "partially-delivered" ? timestamp : undefined
          };
        }
        return stop;
      });

      const allCompleted = updatedStops.every((s) => s.status === "delivered" || s.status === "failed");

      return {
        ...dsp,
        status: allCompleted ? ("completed" as const) : dsp.status,
        stops: updatedStops
      };
    });

    // Update order status
    const orderStatusMap: Record<StopDeliveryStatus, OrderStatus> = {
      pending: "dispatched",
      "in-transit": "dispatched",
      reached: "dispatched",
      delivered: "delivered",
      "partially-delivered": "partially-delivered",
      failed: "dispatched"
    };

    const nextOrderStatus = orderStatusMap[status];

    const updatedOrders = orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      return {
        ...ord,
        status: nextOrderStatus,
        timeline: [
          ...ord.timeline,
          {
            id: `tl-${ord.id}-${Date.now()}`,
            timestamp,
            status: nextOrderStatus,
            actorName: "Delivery Staff",
            actorRole: "delivery-staff",
            note:
              status === "delivered"
                ? `Delivery completed (${deliveredUnits || ord.totalUnitsApproved} units). Recipient signed.`
                : status === "partially-delivered"
                ? `Partial Delivery (${deliveredUnits} units). Reason: ${failureReason || notes}`
                : status === "reached"
                ? `Vehicle arrived at branch.`
                : `Delivery issue: ${failureReason || notes}`
          }
        ]
      };
    });

    setDispatches(updatedDispatches);
    setOrders(updatedOrders);
    persistState({ dispatches: updatedDispatches, orders: updatedOrders });
    showToast(`Stop status updated to: ${status}`, "success");
  };

  // 12. Receive Shipment & Discrepancy Reporting (Branch Admin)
  const receiveShipment = (
    orderId: string,
    receivedUnitsMap: Record<string, number>,
    missingMap: Record<string, number>,
    damagedMap: Record<string, number>,
    discrepancyNotes?: string
  ) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    let totalMissing = 0;
    let totalDamaged = 0;
    const missingItemsList: { productId: string; name: string; quantity: number }[] = [];
    const damagedItemsList: { productId: string; name: string; quantity: number }[] = [];

    const updatedItems = targetOrder.items.map((item) => {
      const received = receivedUnitsMap[item.productId] ?? item.approvedUnits;
      const missing = missingMap[item.productId] ?? 0;
      const damaged = damagedMap[item.productId] ?? 0;

      totalMissing += missing;
      totalDamaged += damaged;

      if (missing > 0) {
        missingItemsList.push({
          productId: item.productId,
          name: item.productName,
          quantity: missing
        });
      }
      if (damaged > 0) {
        damagedItemsList.push({
          productId: item.productId,
          name: item.productName,
          quantity: damaged
        });
      }

      return {
        ...item,
        receivedUnits: received,
        missingUnits: missing,
        damagedUnits: damaged
      };
    });

    const hasDiscrepancy = totalMissing > 0 || totalDamaged > 0;
    const now = new Date();
    const timestamp = now.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    let newDiscrepancy: DiscrepancyReport | null = null;
    if (hasDiscrepancy) {
      newDiscrepancy = {
        id: `disc-${Date.now()}`,
        orderId: targetOrder.id,
        orderNumber: targetOrder.orderNumber,
        branchId: targetOrder.branchId,
        branchName: targetOrder.branchName,
        reportedAt: timestamp,
        discrepancyType: totalMissing > 0 && totalDamaged > 0 ? "both" : totalMissing > 0 ? "missing" : "damaged",
        missingItems: missingItemsList,
        damagedItems: damagedItemsList,
        notes: discrepancyNotes || "Branch recorded discrepancy upon physical count.",
        status: "open"
      };
    }

    const updatedOrders = orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      return {
        ...ord,
        status: "delivered" as OrderStatus,
        items: updatedItems,
        timeline: [
          ...ord.timeline,
          {
            id: `tl-${orderId}-${Date.now()}`,
            timestamp,
            status: "delivered" as OrderStatus,
            actorName: "Branch Admin",
            actorRole: "branch-admin",
            note: hasDiscrepancy
              ? `Shipment physically received with Discrepancy logged (${totalMissing} missing, ${totalDamaged} damaged). Notes: ${discrepancyNotes || "N/A"}`
              : `Shipment physically verified & received 100% intact.`
          }
        ]
      };
    });

    const updatedDiscrepancies = newDiscrepancy
      ? [newDiscrepancy, ...discrepancies]
      : discrepancies;

    setOrders(updatedOrders);
    setDiscrepancies(updatedDiscrepancies);
    persistState({ orders: updatedOrders, discrepancies: updatedDiscrepancies });

    if (hasDiscrepancy) {
      showToast(
        `Shipment confirmed with discrepancy flagged. Super Admin notified.`,
        "info"
      );
    } else {
      showToast(`Shipment confirmed 100% received in good order!`, "success");
    }
  };

  // 13. Adjust Inventory (Super Admin)
  const adjustInventory = (
    productId: string,
    changeAmount: number,
    reason: "Production Output" | "Damaged Stock" | "Inventory Audit" | "Manual Correction"
  ) => {
    let prodName = "";
    let finalStock = 0;

    const updatedProducts = products.map((prod) => {
      if (prod.id !== productId) return prod;
      prodName = prod.name;
      finalStock = Math.max(0, prod.currentStock + changeAmount);
      return {
        ...prod,
        currentStock: finalStock
      };
    });

    const now = new Date();
    const timestamp = now.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const newLog: InventoryAdjustmentLog = {
      id: `log-${Date.now()}`,
      productId,
      productName: prodName,
      timestamp,
      changeAmount,
      newStockLevel: finalStock,
      reason,
      actorName: "M. Faizal (Factory Mgr)"
    };

    const updatedLogs = [newLog, ...inventoryLogs];
    setProducts(updatedProducts);
    setInventoryLogs(updatedLogs);
    persistState({ products: updatedProducts, inventoryLogs: updatedLogs });
    showToast(`Inventory adjusted: ${prodName} (${changeAmount > 0 ? "+" : ""}${changeAmount} units)`, "success");
  };

  // 14. Toggle Product Active
  const toggleProductActive = (productId: string) => {
    const updated = products.map((prod) => {
      if (prod.id !== productId) return prod;
      const nextActive = !prod.isActive;
      showToast(
        `${prod.name} marked as ${nextActive ? "Active" : "Inactive"}.`,
        "info"
      );
      return {
        ...prod,
        isActive: nextActive
      };
    });
    setProducts(updated);
    persistState({ products: updated });
  };

  // 15. Save Product
  const saveProduct = (productData: AdminProduct) => {
    const exists = products.some((p) => p.id === productData.id);
    let updated: AdminProduct[];
    if (exists) {
      updated = products.map((p) => (p.id === productData.id ? productData : p));
      showToast(`Product "${productData.name}" details updated.`, "success");
    } else {
      updated = [productData, ...products];
      showToast(`New product "${productData.name}" added to catalogue.`, "success");
    }
    setProducts(updated);
    persistState({ products: updated });
  };

  return (
    <AdminContext.Provider
      value={{
        demoRole,
        setDemoRole: (role) => {
          setDemoRole(role);
          persistState({ demoRole: role });
        },
        demoBranchId,
        setDemoBranchId: (bId) => {
          setDemoBranchId(bId);
          persistState({ demoBranchId: bId });
        },
        demoDriverId,
        setDemoDriverId: (dId) => {
          setDemoDriverId(dId);
          persistState({ demoDriverId: dId });
        },
        orders,
        products,
        dispatches,
        users,
        discrepancies,
        inventoryLogs,
        toast,
        showToast,
        submitOrder,
        saveOrderDraft,
        cancelOrder,
        requestAmendment,
        approveOrder,
        rejectOrder,
        returnOrderForCorrection,
        createDispatchBatch,
        updateDispatchLoadingChecklist,
        markDispatchDeparted,
        updateDeliveryStop,
        receiveShipment,
        adjustInventory,
        toggleProductActive,
        saveProduct,
        resetDemoData
      }}
    >
      {children}
      {/* Floating Demo Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[9999] max-w-md animate-fade-in shadow-2xl rounded-2xl overflow-hidden border border-slate-200 bg-white">
          <div
            className={`flex items-start gap-3 p-4 ${
              toast.type === "success"
                ? "bg-emerald-50 text-emerald-950 border-l-4 border-l-emerald-600"
                : toast.type === "error"
                ? "bg-rose-50 text-rose-950 border-l-4 border-l-rose-600"
                : "bg-blue-50 text-blue-950 border-l-4 border-l-blue-600"
            }`}
          >
            <div className="mt-0.5 text-lg">
              {toast.type === "success" ? "✓" : toast.type === "error" ? "⚠" : "ℹ"}
            </div>
            <div className="flex-1 text-sm font-medium leading-snug">
              {toast.message}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-slate-700 text-xs px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}
