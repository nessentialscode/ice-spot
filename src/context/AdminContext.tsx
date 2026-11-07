"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import {
  AdminRole,
  AdminOrder,
  AdminProduct,
  DispatchBatch,
  DispatchStop,
  AdminUserAccount,
  DiscrepancyReport,
  InventoryAdjustmentLog,
  OrderItem,
  StopDeliveryStatus,
  OrderStatus,
  DeliveryTripStatus,
  FleetVehicle
} from "@/types/admin";
import {
  INITIAL_ADMIN_PRODUCTS,
  INITIAL_ADMIN_ORDERS,
  INITIAL_DISPATCH_BATCHES,
  INITIAL_ADMIN_USERS,
  INITIAL_DISCREPANCIES,
  INITIAL_INVENTORY_LOGS,
  INITIAL_FLEET_VEHICLES
} from "@/lib/data/adminMockData";
import { BRANCHES } from "@/lib/data/branches";
import { Branch } from "@/types";
import {
  createOrderAction,
  approveOrderAction,
  rejectOrderAction,
  returnOrderForCorrectionAction,
  updateOrderStatusAction,
  confirmOrderReceiptAction,
  getOrdersAction,
} from "@/lib/actions/orders";
import { adjustInventoryAction, createProductAction } from "@/lib/actions/inventory";
import {
  createDispatchAction,
  updateStopStatusAction,
  getDispatchesAction,
  getEligibleOrdersForDispatchAction,
  DeliveredItemInput,
} from "@/lib/actions/dispatches";
import { getItemCrates, getItemSticks } from "@/lib/actions/dispatch-helpers";
import { toggleBranchStatusAction, setAllBranchesStatusAction } from "@/lib/actions/branches";

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
    branchName?: string;
    branchCode?: string;
    destinationFactory?: string;
    items: OrderItem[];
    notes?: string;
    requestedDeliveryDate: string;
    serverOrderId?: string;
    serverOrderNumber?: string | number;
    skipServerSync?: boolean;
  }) => string;
  syncOrdersFromServer: () => Promise<void>;
  saveOrderDraft: (data: {
    branchId: string;
    items: OrderItem[];
    notes?: string;
  }) => string;
  cancelOrder: (orderId: string, reason: string) => Promise<{ success: boolean; message: string }> | void;
  requestAmendment: (orderId: string, amendmentNotes: string) => void;
  approveOrder: (
    orderId: string,
    approvedPacksMap: Record<string, number>,
    factoryNotes?: string
  ) => Promise<{ success: boolean; message: string }> | void;
  rejectOrder: (orderId: string, reason: string) => Promise<{ success: boolean; message: string }> | void;
  returnOrderForCorrection: (orderId: string, notes: string) => Promise<{ success: boolean; message: string }> | void;
  createDispatchBatch: (data: {
    vehicleNumber: string;
    driverId: string;
    driverName: string;
    orderIds: string[];
    notes?: string;
    departureTime?: string;
  }) => Promise<{ success: boolean; message: string; dispatchId?: string; manifestNumber?: string }> | string;
  syncDispatchesFromServer: () => Promise<void>;
  updateDispatchLoadingChecklist: (
    dispatchId: string,
    loadedMap: Record<string, number>
  ) => void;
  updateDispatchTrip: (
    dispatchId: string,
    data: {
      vehicleNumber?: string;
      departureTime?: string;
      status?: DeliveryTripStatus;
      notes?: string;
      stops?: DispatchStop[];
      totalUnits?: number;
    }
  ) => void;
  isHydrated: boolean;
  markDispatchDeparted: (
    dispatchId: string,
    additionalUpdates?: {
      vehicleNumber?: string;
      departureTime?: string;
      notes?: string;
      stops?: DispatchStop[];
      totalUnits?: number;
    }
  ) => void;
  updateDeliveryStop: (
    dispatchId: string,
    orderId: string,
    status: StopDeliveryStatus,
    deliveredUnits?: number,
    notes?: string,
    failureReason?: string,
    deliveredItems?: DeliveredItemInput[]
  ) => Promise<{ success: boolean; message: string }>;
  receiveShipment: (
    orderId: string,
    receivedUnitsMap: Record<string, number>,
    missingMap: Record<string, number>,
    damagedMap: Record<string, number>,
    discrepancyNotes?: string
  ) => Promise<{ success: boolean; message: string }>;
  adjustInventory: (
    productId: string,
    changeAmount: number,
    reason: "Production Output" | "Damaged Stock" | "Inventory Audit" | "Manual Correction"
  ) => Promise<{ success: boolean; message?: string }> | void;
  branches: (Branch & { isOpen: boolean })[];
  toggleBranchOpenStatus: (branchId: string) => Promise<{ success: boolean; message?: string }> | void;
  setAllBranchesOpenStatus: (isOpen: boolean) => Promise<{ success: boolean; message?: string }> | void;
  addProduct: (product: Omit<AdminProduct, "id"> & { id?: string }) => Promise<{ success: boolean; id?: string; message?: string }>;
  toggleProductActive: (productId: string) => void;
  saveProduct: (product: AdminProduct) => void;
  resetDemoData: () => void;
  fleetVehicles: FleetVehicle[];
  addFleetVehicle: (data: { registrationNumber: string; modelOrType: string; capacityCrates?: number }) => { success: boolean; message: string; vehicle?: FleetVehicle };
  updateFleetVehicle: (id: string, data: { registrationNumber: string; modelOrType: string; capacityCrates?: number }) => { success: boolean; message: string };
  deleteFleetVehicle: (id: string) => { success: boolean; message: string };
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

const STORAGE_KEY = "icespot_admin_demo_state_v2";

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
  const [branches, setBranches] = useState<(Branch & { isOpen: boolean })[]>(() =>
    BRANCHES.map((b) => ({ ...b, isOpen: b.status !== "candidate" }))
  );
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicle[]>(INITIAL_FLEET_VEHICLES);
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [inFlightReceipts, setInFlightReceipts] = useState<Record<string, boolean>>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const isSyncingOrdersRef = useRef(false);
  const isSyncingDispatchesRef = useRef(false);

  // Load from localStorage once on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem("icespot_admin_demo_state_v1")) {
        localStorage.removeItem("icespot_admin_demo_state_v1");
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.orders) setOrders(parsed.orders);
        if (parsed.products) setProducts(parsed.products);
        if (parsed.dispatches) setDispatches(parsed.dispatches);
        if (parsed.users) setUsers(parsed.users);
        if (parsed.discrepancies) setDiscrepancies(parsed.discrepancies);
        if (parsed.inventoryLogs) setInventoryLogs(parsed.inventoryLogs);
        if (parsed.branches) setBranches(parsed.branches);
        if (parsed.fleetVehicles && Array.isArray(parsed.fleetVehicles)) setFleetVehicles(parsed.fleetVehicles);
        if (parsed.demoRole) setDemoRole(parsed.demoRole);
        if (parsed.demoBranchId) setDemoBranchId(parsed.demoBranchId);
        if (parsed.demoDriverId) setDemoDriverId(parsed.demoDriverId);
      }
    } catch (e) {
      console.warn("Failed to read localStorage demo state", e);
    } finally {
      setIsHydrated(true);
      syncOrdersFromServer();
      syncDispatchesFromServer();
    }
  }, []);

  // Save changes to localStorage
  const persistState = (newPartial: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    try {
      let existing: Record<string, unknown> = {};
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          existing = JSON.parse(saved);
        } catch {
          // ignore corrupted JSON
        }
      }
      const current = {
        ...existing,
        orders,
        products,
        dispatches,
        users,
        discrepancies,
        inventoryLogs,
        branches,
        fleetVehicles,
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
    setOrders([]);
    setProducts(INITIAL_ADMIN_PRODUCTS);
    setDispatches([]);
    setUsers(INITIAL_ADMIN_USERS);
    setDiscrepancies(INITIAL_DISCREPANCIES);
    setInventoryLogs(INITIAL_INVENTORY_LOGS);
    const resetBranches = BRANCHES.map((b) => ({ ...b, isOpen: b.status !== "candidate" }));
    setBranches(resetBranches);
    setFleetVehicles(INITIAL_FLEET_VEHICLES);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("icespot_admin_demo_state_v1");
      localStorage.removeItem("icespot_active_dispatch_id");
      window.dispatchEvent(new CustomEvent("icespot_branch_status_update", { detail: resetBranches }));
    }
    showToast("Demonstration data reset to initial seed values.", "info");
  };

  const syncOrdersFromServer = useCallback(async () => {
    if (isSyncingOrdersRef.current) return;
    isSyncingOrdersRef.current = true;
    try {
      const res = await getOrdersAction();
      if (res.success) {
        const serverOrders = res.data || [];
        let eligibleOrders: AdminOrder[] = [];

        // Also sync eligible dispatch orders for delivery staff trip scheduling
        try {
          const eligRes = await getEligibleOrdersForDispatchAction();
          if (eligRes.success && eligRes.data) {
            eligibleOrders = eligRes.data.map((eo) => ({
              id: eo.id,
              orderNumber: eo.orderNumber,
              branchId: eo.branchId,
              branchName: eo.branchName,
              branchCode: eo.branchCode,
              destinationFactory: "Varavoor Factory",
              district: "Thrissur",
              submittedAt: "Recent",
              requestedDeliveryDate: "Next Scheduled Run",
              status: eo.status,
              totalUnitsRequested: eo.totalApprovedUnits,
              totalUnitsApproved: eo.totalApprovedUnits,
              branchNotes: "",
              timeline: [],
              items: eo.items,
            }));
          }
        } catch {
          // gracefully continue
        }

        const map = new Map<string, AdminOrder>();
        // Key strictly by order.id to prevent duplicate entries
        serverOrders.forEach((so) => {
          if (so.id) {
            map.set(so.id, so);
          }
        });

        eligibleOrders.forEach((eo) => {
          if (!eo.id) return;
          const existing = map.get(eo.id);

          if (!existing) {
            map.set(eo.id, eo);
          } else {
            const targetKey = existing.id;
            map.set(targetKey, {
              ...existing,
              status: eo.status || existing.status,
              items: eo.items && eo.items.length > 0 ? eo.items : existing.items,
              totalUnitsApproved: eo.totalUnitsApproved ?? existing.totalUnitsApproved,
            });
          }
        });

        const authoritativeOrders = Array.from(map.values());
        setOrders(authoritativeOrders);
        persistState({ orders: authoritativeOrders });
      }
    } catch (err) {
      console.warn("[AdminContext] Error fetching orders from server:", err);
    } finally {
      isSyncingOrdersRef.current = false;
    }
  }, []);

  const syncDispatchesFromServer = useCallback(async () => {
    if (isSyncingDispatchesRef.current) return;
    isSyncingDispatchesRef.current = true;
    try {
      const res = await getDispatchesAction();
      if (res.success) {
        const serverDispatches = res.data || [];
        setDispatches(serverDispatches);
        persistState({ dispatches: serverDispatches });
      }
    } catch (err) {
      console.warn("[AdminContext] Error fetching dispatches from server:", err);
    } finally {
      isSyncingDispatchesRef.current = false;
    }
  }, []);

  // 1. Submit Weekly Order
  const submitOrder = (data: {
    branchId: string;
    branchName?: string;
    branchCode?: string;
    destinationFactory?: string;
    items: OrderItem[];
    notes?: string;
    requestedDeliveryDate: string;
    serverOrderId?: string;
    serverOrderNumber?: string | number;
    skipServerSync?: boolean;
  }): string => {
    const branch =
      branches.find((b) => b.id === data.branchId) ||
      BRANCHES.find(
        (b) =>
          b.id === data.branchId ||
          (data.branchCode && b.id.includes(data.branchCode.toLowerCase())) ||
          (data.branchName && b.name.toLowerCase() === data.branchName.toLowerCase())
      );
    const branchName = data.branchName || branch?.name || "Ice Spot Ollur";
    const branchCode =
      data.branchCode ||
      (branch ? (branch as any).code || `BR-${branch.id.slice(0, 3).toUpperCase()}` : "BR-OLL-003");
    const destinationFactory = data.destinationFactory || "Varavoor Factory";
    const nextNum = 105 + orders.length;
    const orderNumber = data.serverOrderNumber
      ? (String(data.serverOrderNumber).startsWith("ORD-")
          ? String(data.serverOrderNumber)
          : `ORD-2026-${data.serverOrderNumber}`)
      : `ORD-2026-${nextNum}`;
    const orderId = data.serverOrderId || `ord-${nextNum}`;

    const totalCrates = data.items.reduce((sum, item) => sum + item.requestedPacks, 0);
    const totalUnitsRequested = data.items.reduce(
      (sum, item) => sum + (item.requestedUnits || item.requestedPacks * 10),
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
      branchCode,
      destinationFactory,
      district: branch?.district || "Thrissur",
      submittedAt: timestamp,
      requestedDeliveryDate: data.requestedDeliveryDate,
      status: "submitted",
      totalUnitsRequested,
      totalUnitsApproved: 0,
      branchNotes: data.notes,
      items: data.items.map((it) => {
        const prod = products.find((p) => p.id === it.productId);
        const unitsPerPack = it.requestedUnits
          ? Math.round(it.requestedUnits / it.requestedPacks)
          : prod?.unitsPerPack || 10;
        return {
          ...it,
          requestedUnits: it.requestedUnits || it.requestedPacks * unitsPerPack,
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
          note: `Submitted weekly order to ${destinationFactory} with ${data.items.length} product lines (${totalCrates} crates / ${totalUnitsRequested} sticks)`
        }
      ]
    };

    // Cleanly deduplicate order if already present (e.g. from server response or local state)
    const filtered = orders.filter((o) => o.id !== orderId && o.orderNumber !== orderNumber);
    const updated = [newOrder, ...filtered];
    setOrders(updated);
    persistState({ orders: updated });

    // Asynchronously synchronize with Supabase PostgreSQL if not already done on server
    if (!data.skipServerSync) {
      createOrderAction({
        branchId: data.branchId,
        items: newOrder.items.map((it) => ({
          productId: it.productId,
          requestedQuantity: it.requestedPacks,
        })),
        notes: data.notes,
      })
        .then((res) => {
          if (!res.success) {
            setOrders(filtered);
            persistState({ orders: filtered });
            showToast(`Order submission failed on server: ${res.message}`, "error");
          } else {
            showToast(`Order ${orderNumber} submitted successfully to ${destinationFactory}!`, "success");
          }
        })
        .catch((err) => {
          setOrders(filtered);
          persistState({ orders: filtered });
          showToast(`Server order sync error: ${err.message || "Failed to sync order"}`, "error");
          console.warn("[AdminContext] Server order sync error:", err);
        });
    } else {
      showToast(`Order ${orderNumber} submitted successfully to ${destinationFactory}!`, "success");
    }

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
      (sum, item) => sum + item.requestedPacks * (products.find((p) => p.id === item.productId)?.unitsPerPack || 10),
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
  const cancelOrder = async (orderId: string, reason: string): Promise<{ success: boolean; message: string }> => {
    const previousOrders = [...orders];
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

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_REGEX.test(orderId)) {
      try {
        const res = await updateOrderStatusAction(orderId, "cancelled", reason);
        if (!res.success) {
          setOrders(previousOrders);
          persistState({ orders: previousOrders });
          showToast(`Failed to cancel order on server: ${res.message}`, "error");
          return { success: false, message: res.message };
        }
      } catch (err: any) {
        setOrders(previousOrders);
        persistState({ orders: previousOrders });
        showToast(`Failed to cancel order: ${err?.message || "Server error"}`, "error");
        return { success: false, message: err?.message || "Server error" };
      }
    }

    showToast(`Order has been marked cancelled.`, "info");
    return { success: true, message: "Order cancelled." };
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
  const approveOrder = async (
    orderId: string,
    approvedPacksMap: Record<string, number>,
    factoryNotes?: string
  ): Promise<{ success: boolean; message: string }> => {
    const previousOrders = [...orders];
    const previousProducts = [...products];
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
        const unitsPerPack = prod?.unitsPerPack || 10;
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

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_REGEX.test(orderId)) {
      try {
        const allocationsList = Object.entries(approvedPacksMap).map(([pId, qty]) => ({
          productId: pId,
          approvedQuantity: qty,
        }));
        const res = await approveOrderAction(orderId, allocationsList, factoryNotes);
        if (!res.success) {
          setOrders(previousOrders);
          setProducts(previousProducts);
          persistState({ orders: previousOrders, products: previousProducts });
          showToast(`Failed to approve order on server: ${res.message}`, "error");
          return { success: false, message: res.message };
        }
        syncOrdersFromServer().catch(() => {});
      } catch (err: any) {
        setOrders(previousOrders);
        setProducts(previousProducts);
        persistState({ orders: previousOrders, products: previousProducts });
        showToast(`Server error approving order: ${err?.message || "Failed to approve"}`, "error");
        return { success: false, message: err?.message || "Server error" };
      }
    }

    showToast(`Order approved. Quantities locked and reserved in cold storage.`, "success");
    return { success: true, message: "Order approved successfully." };
  };

  // 6. Reject Order
  const rejectOrder = async (orderId: string, reason: string): Promise<{ success: boolean; message: string }> => {
    if (!reason || !reason.trim()) {
      showToast("Please provide a reason for order rejection.", "error");
      return { success: false, message: "Rejection reason is required." };
    }

    const trimmedReason = reason.trim();
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (UUID_REGEX.test(orderId)) {
      try {
        const res = await rejectOrderAction(orderId, trimmedReason);
        if (!res.success) {
          showToast(`Failed to reject order on server: ${res.message}`, "error");
          return { success: false, message: res.message };
        }
      } catch (err: any) {
        showToast(`Server error rejecting order: ${err?.message || "Failed to reject"}`, "error");
        return { success: false, message: err?.message || "Server error" };
      }
    }

    // Update local state ONLY after server confirmation (or for local mock order)
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
        cancelReason: trimmedReason,
        factoryNotes: `Rejected by factory: ${trimmedReason}`,
        timeline: [
          ...ord.timeline,
          {
            id: `tl-${orderId}-${Date.now()}`,
            timestamp,
            status: "cancelled" as OrderStatus,
            actorName: "M. Faizal",
            actorRole: "super-admin",
            note: `Rejected by factory: ${trimmedReason}`
          }
        ]
      };
    });
    setOrders(updated);
    persistState({ orders: updated });

    if (UUID_REGEX.test(orderId)) {
      syncOrdersFromServer().catch(() => {});
    }

    showToast(`Order has been rejected with reason recorded.`, "info");
    return { success: true, message: "Order rejected." };
  };

  // 7. Return for correction
  const returnOrderForCorrection = async (orderId: string, notes: string): Promise<{ success: boolean; message: string }> => {
    if (!notes || !notes.trim()) {
      showToast("Please provide feedback for correction.", "error");
      return { success: false, message: "Correction feedback is required." };
    }

    const trimmedNotes = notes.trim();
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (UUID_REGEX.test(orderId)) {
      try {
        const res = await returnOrderForCorrectionAction(orderId, trimmedNotes);
        if (!res.success) {
          showToast(`Failed to return order on server: ${res.message}`, "error");
          return { success: false, message: res.message };
        }
      } catch (err: any) {
        showToast(`Server error returning order: ${err?.message || "Failed to update"}`, "error");
        return { success: false, message: err?.message || "Server error" };
      }
    }

    // Update local state ONLY after server confirmation (or for local mock order)
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
        status: "amendment-requested" as OrderStatus,
        amendmentNotes: trimmedNotes,
        factoryNotes: `Returned for correction: ${trimmedNotes}`,
        timeline: [
          ...ord.timeline,
          {
            id: `tl-${orderId}-${Date.now()}`,
            timestamp,
            status: "amendment-requested" as OrderStatus,
            actorName: "M. Faizal",
            actorRole: "super-admin",
            note: `Returned for correction: ${trimmedNotes}`
          }
        ]
      };
    });
    setOrders(updated);
    persistState({ orders: updated });

    if (UUID_REGEX.test(orderId)) {
      syncOrdersFromServer().catch(() => {});
    }

    showToast(`Order returned to branch for correction.`, "info");
    return { success: true, message: "Order returned for correction." };
  };

  // 8. Create Dispatch Batch
  const createDispatchBatch = async (data: {
    vehicleNumber: string;
    driverId: string;
    driverName: string;
    orderIds: string[];
    notes?: string;
    departureTime?: string;
  }): Promise<{ success: boolean; message: string; dispatchId?: string; manifestNumber?: string }> => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const hasServerUUIDs = data.orderIds.length > 0 && data.orderIds.every((id) => UUID_REGEX.test(id));

    // If server UUIDs are present, persist through server action first
    if (hasServerUUIDs) {
      try {
        const res = await createDispatchAction({
          vehicleNumber: data.vehicleNumber,
          driverId: data.driverId && UUID_REGEX.test(data.driverId) ? data.driverId : undefined,
          driverName: data.driverName,
          orderIds: data.orderIds,
          notes: data.notes,
          departureTime: data.departureTime,
        });

        if (!res.success || !res.data) {
          showToast(`Server dispatch creation failed: ${res.message}`, "error");
          return { success: false, message: res.message };
        }

        const serverDispatchId = res.data.dispatchId;
        const serverManifestNumber = res.data.manifestNumber;

        // Sync from server to reload the canonical persisted records
        await Promise.all([syncDispatchesFromServer(), syncOrdersFromServer()]);

        showToast(`Dispatch ${serverManifestNumber} created and saved to database!`, "success");
        return {
          success: true,
          message: res.message,
          dispatchId: serverDispatchId,
          manifestNumber: serverManifestNumber,
        };
      } catch (err: any) {
        const msg = err.message || "Failed to create dispatch on server.";
        showToast(msg, "error");
        return { success: false, message: msg };
      }
    }

    // Local fallback for mock demo state
    const nextNum = 91 + dispatches.length;
    const manifestNumber = `DSP-VRV-${nextNum.toString().padStart(3, "0")}`;
    const dispatchId = `dsp-${nextNum}`;

    const driverUser = users.find((u) => u.id === data.driverId);
    const selectedOrders = orders.filter((o) => data.orderIds.includes(o.id));

    let totalUnits = 0;
    const stops = selectedOrders.map((ord, idx) => {
      const branch = BRANCHES.find((b) => b.id === ord.branchId);
      const units = ord.items.reduce((s, it) => s + getItemSticks(it), 0);
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
          packedUnits: getItemSticks(it),
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
      departureTime: data.departureTime || "12:45 PM",
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
    return {
      success: true,
      message: `Manifest ${manifestNumber} generated successfully.`,
      dispatchId,
      manifestNumber,
    };
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

  // 9b. Update Dispatch Trip (Driver & Logistics configuration)
  const updateDispatchTrip = (
    dispatchId: string,
    data: {
      vehicleNumber?: string;
      departureTime?: string;
      status?: DeliveryTripStatus;
      notes?: string;
      stops?: DispatchStop[];
      totalUnits?: number;
    }
  ) => {
    const targetDsp = dispatches.find((d) => d.id === dispatchId);
    if (targetDsp && targetDsp.status === "completed") {
      showToast("Cannot modify a completed dispatch. Completed trips are locked.", "error");
      return;
    }

    let updatedDispatches: DispatchBatch[];
    if (targetDsp) {
      updatedDispatches = dispatches.map((dsp) => {
        if (dsp.id !== dispatchId) return dsp;
        const updatedStops = data.stops !== undefined ? data.stops : dsp.stops;
        const updatedOrderIds = data.stops !== undefined
          ? Array.from(new Set(data.stops.map((s) => s.orderId).filter(Boolean)))
          : dsp.orderIds;

        return {
          ...dsp,
          ...(data.vehicleNumber !== undefined ? { vehicleNumber: data.vehicleNumber } : {}),
          ...(data.departureTime !== undefined
            ? { departureTime: data.departureTime, departedAt: data.departureTime }
            : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.status === "completed" && !dsp.completedAt ? { completedAt: new Date().toISOString() } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.stops !== undefined ? { stops: updatedStops, orderIds: updatedOrderIds } : {}),
          ...(data.totalUnits !== undefined ? { totalUnits: data.totalUnits } : {}),
        };
      });
    } else {
      const newDsp: DispatchBatch = {
        id: dispatchId,
        manifestNumber: `DSP-VRV-${String(dispatches.length + 89).padStart(3, "0")}`,
        vehicleNumber: data.vehicleNumber || "KL-08-AX-4412",
        driverId: "cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43",
        driverName: "Icespot Logistics Staff",
        driverPhone: "+91 98460 11223",
        dispatchDate: new Date().toISOString().split("T")[0],
        departureTime: data.departureTime || "07:45 AM",
        status: data.status || "scheduled",
        completedAt: data.status === "completed" ? new Date().toISOString() : undefined,
        orderIds: data.stops ? data.stops.map((s) => s.orderId) : [],
        stops: data.stops || [],
        totalUnits: data.totalUnits || 240,
        notes: data.notes || "",
      };
      updatedDispatches = [newDsp, ...dispatches];
    }

    setDispatches(updatedDispatches);
    persistState({ dispatches: updatedDispatches });
  };

  // 10. Mark Dispatch Departed
  const markDispatchDeparted = (
    dispatchId: string,
    additionalUpdates?: {
      vehicleNumber?: string;
      departureTime?: string;
      notes?: string;
      stops?: DispatchStop[];
      totalUnits?: number;
    }
  ) => {
    const target = dispatches.find((d) => d.id === dispatchId);
    if (target && target.status === "completed") {
      showToast("Cannot dispatch a completed trip.", "error");
      return;
    }
    if (target && target.status === "in-transit") {
      showToast("Trip is already in-transit.", "info");
      return;
    }

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
      const mergedStops = additionalUpdates?.stops !== undefined ? additionalUpdates.stops : dsp.stops;
      const orderIdsFromStops = additionalUpdates?.stops !== undefined
        ? Array.from(new Set(additionalUpdates.stops.map((s) => s.orderId).filter(Boolean)))
        : dsp.orderIds;
      targetOrderIds = orderIdsFromStops;
      return {
        ...dsp,
        ...(additionalUpdates?.vehicleNumber ? { vehicleNumber: additionalUpdates.vehicleNumber } : {}),
        ...(additionalUpdates?.departureTime ? { departureTime: additionalUpdates.departureTime } : {}),
        ...(additionalUpdates?.notes !== undefined ? { notes: additionalUpdates.notes } : {}),
        ...(additionalUpdates?.totalUnits !== undefined ? { totalUnits: additionalUpdates.totalUnits } : {}),
        status: "in-transit" as const,
        departedAt: additionalUpdates?.departureTime || timestamp,
        stops: mergedStops.map((s) => ({
          ...s,
          status: s.status === "delivered" ? "delivered" : ("in-transit" as StopDeliveryStatus)
        })),
        orderIds: orderIdsFromStops
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
  const updateDeliveryStop = async (
    dispatchId: string,
    orderId: string,
    status: StopDeliveryStatus,
    deliveredUnits?: number,
    notes?: string,
    failureReason?: string,
    deliveredItems?: DeliveredItemInput[]
  ): Promise<{ success: boolean; message: string }> => {
    const previousDispatches = [...dispatches];
    const previousOrders = [...orders];
    const previousDiscrepancies = [...discrepancies];

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
        completedAt: allCompleted ? (dsp.completedAt || new Date().toISOString()) : dsp.completedAt,
        stops: updatedStops
      };
    });

    // Update order status
    const orderStatusMap: Record<StopDeliveryStatus, OrderStatus> = {
      pending: "dispatched",
      scheduled: "dispatched",
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

    const hasShortageDiscrepancy =
      status === "partially-delivered" ||
      (deliveredItems && deliveredItems.some((it) => (it.returnedSticks || 0) > 0 || (it.shortageQuantity || 0) > 0));

    let updatedDiscrepancies = discrepancies;
    if (hasShortageDiscrepancy) {
      const itemsWithShortage = (deliveredItems || []).filter(
        (it) => (it.returnedSticks || 0) > 0 || (it.shortageQuantity || 0) > 0
      );
      const targetOrd = orders.find((o) => o.id === orderId);
      const disc: DiscrepancyReport = {
        id: `disc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        orderId,
        orderNumber: targetOrd?.orderNumber || `ORD-${orderId.slice(0, 4)}`,
        branchId: targetOrd?.branchId || "unknown",
        branchName: targetOrd?.branchName || "Ice Spot Branch",
        reportedAt: timestamp,
        discrepancyType: "missing",
        status: "open",
        notes: notes || failureReason || "Shortage / returned crates recorded during delivery handover",
        missingItems: itemsWithShortage.map((it) => {
          const prod = products.find((p) => p.id === it.productId);
          return {
            productId: it.productId,
            name: prod?.name || "Handcrafted Stick",
            quantity: it.returnedSticks !== undefined ? it.returnedSticks : Math.round((it.shortageQuantity || 0) * 10),
          };
        }),
        damagedItems: [],
      };
      updatedDiscrepancies = [disc, ...discrepancies];
      setDiscrepancies(updatedDiscrepancies);
    }

    setDispatches(updatedDispatches);
    setOrders(updatedOrders);
    persistState({
      dispatches: updatedDispatches,
      orders: updatedOrders,
      discrepancies: updatedDiscrepancies,
    });

    // Synchronize with Supabase PostgreSQL if UUID identifiers
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_REGEX.test(dispatchId) && UUID_REGEX.test(orderId)) {
      try {
        const res = await updateStopStatusAction(
          dispatchId,
          orderId,
          status,
          deliveredUnits,
          notes,
          failureReason,
          deliveredItems
        );

        if (!res.success) {
          setDispatches(previousDispatches);
          setOrders(previousOrders);
          setDiscrepancies(previousDiscrepancies);
          persistState({
            dispatches: previousDispatches,
            orders: previousOrders,
            discrepancies: previousDiscrepancies,
          });
          showToast(`Server stop update error: ${res.message}`, "error");
          return { success: false, message: res.message };
        }

        await Promise.all([
          syncDispatchesFromServer().catch(() => {}),
          syncOrdersFromServer().catch(() => {})
        ]);
      } catch (err: any) {
        setDispatches(previousDispatches);
        setOrders(previousOrders);
        setDiscrepancies(previousDiscrepancies);
        persistState({
          dispatches: previousDispatches,
          orders: previousOrders,
          discrepancies: previousDiscrepancies,
        });
        const errMsg = err?.message || "Failed to update stop status on server";
        showToast(`Server stop update error: ${errMsg}`, "error");
        return { success: false, message: errMsg };
      }
    }

    showToast(`Stop status updated to: ${status}`, "success");
    return { success: true, message: `Stop status updated to: ${status}` };
  };

  // 12. Receive Shipment & Discrepancy Reporting (Branch Admin)
  const receiveShipment = async (
    orderId: string,
    receivedUnitsMap: Record<string, number>,
    missingMap: Record<string, number>,
    damagedMap: Record<string, number>,
    discrepancyNotes?: string
  ): Promise<{ success: boolean; message: string }> => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) {
      const notFoundMsg = `Order ${orderId} not found.`;
      showToast(notFoundMsg, "error");
      return { success: false, message: notFoundMsg };
    }

    if (inFlightReceipts[orderId]) {
      const waitMsg = "Receipt confirmation already in progress. Please wait.";
      showToast(waitMsg, "info");
      return { success: false, message: waitMsg };
    }

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
          quantity: missing,
        });
      }
      if (damaged > 0) {
        damagedItemsList.push({
          productId: item.productId,
          name: item.productName,
          quantity: damaged,
        });
      }

      return {
        ...item,
        receivedUnits: received,
        missingUnits: missing,
        damagedUnits: damaged,
      };
    });

    const hasDiscrepancy = totalMissing > 0 || totalDamaged > 0;
    const receiptStatus: "intact" | "discrepancy" = hasDiscrepancy ? "discrepancy" : "intact";

    // Mark in-flight to prevent duplicate concurrent submissions
    setInFlightReceipts((prev) => ({ ...prev, [orderId]: true }));
    showToast("Synchronizing shipment receipt with database...", "info");

    try {
      // 1. Invoke server action with strict authorization & RPC execution
      const serverResult = await confirmOrderReceiptAction({
        orderId,
        receiptStatus,
        notes:
          discrepancyNotes ||
          (hasDiscrepancy
            ? "Shipment received with discrepancy flagged."
            : "Confirmed 100% full receipt."),
        receivedMap: receivedUnitsMap,
        missingMap,
        damagedMap,
      });

      if (!serverResult.success) {
        // Database rejected receipt: do NOT show false success, do NOT mark delivered locally
        const errMsg = serverResult.message || "Failed to confirm shipment receipt on server.";
        showToast(`Server receipt rejection: ${errMsg}`, "error");
        setInFlightReceipts((prev) => ({ ...prev, [orderId]: false }));
        return { success: false, message: errMsg };
      }

      // 2. Server confirmed receipt: persist database-confirmed state to local view
      const now = new Date();
      const timestamp = now.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
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
          discrepancyType:
            totalMissing > 0 && totalDamaged > 0
              ? "both"
              : totalMissing > 0
              ? "missing"
              : "damaged",
          missingItems: missingItemsList,
          damagedItems: damagedItemsList,
          notes: discrepancyNotes || "Branch recorded discrepancy upon physical count.",
          status: "open",
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
                ? `Shipment verified & received with Discrepancy logged (${totalMissing} missing, ${totalDamaged} damaged). Notes: ${
                    discrepancyNotes || "N/A"
                  }`
                : `Shipment physically verified & received 100% intact. Database confirmed.`,
            },
          ],
        };
      });

      const updatedDiscrepancies = newDiscrepancy
        ? [newDiscrepancy, ...discrepancies]
        : discrepancies;

      setOrders(updatedOrders);
      setDiscrepancies(updatedDiscrepancies);
      persistState({ orders: updatedOrders, discrepancies: updatedDiscrepancies });

      const successMsg =
        serverResult.message ||
        (hasDiscrepancy
          ? "Shipment confirmed with discrepancy flagged. Super Admin notified."
          : "Shipment confirmed 100% received in good order!");

      showToast(successMsg, hasDiscrepancy ? "info" : "success");
      setInFlightReceipts((prev) => ({ ...prev, [orderId]: false }));
      return { success: true, message: successMsg };
    } catch (err: any) {
      setInFlightReceipts((prev) => ({ ...prev, [orderId]: false }));
      const unexpectedMsg =
        err.message || "An unexpected error occurred while confirming receipt.";
      showToast(unexpectedMsg, "error");
      return { success: false, message: unexpectedMsg };
    }
  };

  // 13. Adjust Inventory (Super Admin)
  const adjustInventory = async (
    productId: string,
    changeAmount: number,
    reason: "Production Output" | "Damaged Stock" | "Inventory Audit" | "Manual Correction"
  ): Promise<{ success: boolean; message?: string }> => {
    let prodName = "";
    let finalStock = 0;
    const previousProducts = [...products];
    const previousLogs = [...inventoryLogs];

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

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_REGEX.test(productId)) {
      try {
        const res = await adjustInventoryAction(productId, changeAmount, reason);
        if (!res.success) {
          setProducts(previousProducts);
          setInventoryLogs(previousLogs);
          persistState({ products: previousProducts, inventoryLogs: previousLogs });
          showToast(`Inventory adjustment failed: ${res.message}`, "error");
          return { success: false, message: res.message };
        }
      } catch (err: any) {
        setProducts(previousProducts);
        setInventoryLogs(previousLogs);
        persistState({ products: previousProducts, inventoryLogs: previousLogs });
        const errorMsg = err.message || "Failed to adjust inventory on server.";
        showToast(errorMsg, "error");
        return { success: false, message: errorMsg };
      }
    }

    showToast(`Inventory adjusted: ${prodName} (${changeAmount > 0 ? "+" : ""}${changeAmount} units)`, "success");
    return { success: true };
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

  // 16. Add New Product / Flavour
  const addProduct = async (
    productData: Omit<AdminProduct, "id"> & { id?: string }
  ): Promise<{ success: boolean; id?: string; message?: string }> => {
    try {
      const res = await createProductAction({
        name: productData.name,
        sku: productData.sku,
        description: (productData as any).description,
        unit: productData.packType || "pack",
        sellingPrice: (productData as any).sellingPrice,
        displayOrder: products.length + 1,
        category: productData.category,
        packType: productData.packType,
        unitsPerPack: productData.unitsPerPack,
        currentStock: productData.currentStock,
        minStockAlert: productData.minStockAlert,
        color: productData.color,
        imageUrl: productData.imageUrl,
      });

      if (!res.success || !res.data?.productId) {
        const errorMsg = res.message || "Failed to create product on server.";
        showToast(errorMsg, "error");
        return { success: false, message: errorMsg };
      }

      const authoritativeId = res.data.productId;
      const newProd: AdminProduct = {
        ...productData,
        id: authoritativeId,
        reservedStock: productData.reservedStock || 0,
        isAvailable: productData.isAvailable ?? true,
        isActive: productData.isActive ?? true,
      };

      saveProduct(newProd);
      return { success: true, id: authoritativeId };
    } catch (err: any) {
      const errorMsg = err.message || "Failed to create product.";
      showToast(errorMsg, "error");
      return { success: false, message: errorMsg };
    }
  };

  // 17. Toggle Branch Open / Closed Status
  const toggleBranchOpenStatus = async (branchId: string): Promise<{ success: boolean; message?: string }> => {
    const previousBranches = [...branches];
    let nextOpen = true;
    let targetName = "";
    const updated = branches.map((b) => {
      if (b.id !== branchId) return b;
      nextOpen = !b.isOpen;
      targetName = b.name;
      return { ...b, isOpen: nextOpen };
    });
    setBranches(updated);
    persistState({ branches: updated });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("icespot_branch_status_update", { detail: updated }));
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_REGEX.test(branchId)) {
      try {
        const res = await toggleBranchStatusAction(branchId, nextOpen);
        if (!res.success) {
          setBranches(previousBranches);
          persistState({ branches: previousBranches });
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("icespot_branch_status_update", { detail: previousBranches }));
          }
          showToast(`Failed to update branch status: ${res.message}`, "error");
          return { success: false, message: res.message };
        }
      } catch (err: any) {
        setBranches(previousBranches);
        persistState({ branches: previousBranches });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("icespot_branch_status_update", { detail: previousBranches }));
        }
        const errorMsg = err.message || "Failed to update branch status on server.";
        showToast(errorMsg, "error");
        return { success: false, message: errorMsg };
      }
    }

    showToast(
      `${targetName || "Branch"} marked as ${nextOpen ? "OPEN" : "CLOSED"}.`,
      nextOpen ? "success" : "info"
    );
    return { success: true };
  };

  // 18. Set All Branches Open / Closed
  const setAllBranchesOpenStatus = async (isOpen: boolean): Promise<{ success: boolean; message?: string }> => {
    const previousBranches = [...branches];
    const updated = branches.map((b) => ({ ...b, isOpen }));
    setBranches(updated);
    persistState({ branches: updated });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("icespot_branch_status_update", { detail: updated }));
    }

    try {
      const res = await setAllBranchesStatusAction(isOpen);
      if (!res.success) {
        setBranches(previousBranches);
        persistState({ branches: previousBranches });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("icespot_branch_status_update", { detail: previousBranches }));
        }
        showToast(`Failed to update network branches: ${res.message}`, "error");
        return { success: false, message: res.message };
      }
    } catch (err: any) {
      setBranches(previousBranches);
      persistState({ branches: previousBranches });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("icespot_branch_status_update", { detail: previousBranches }));
      }
      const errorMsg = err.message || "Failed to update network branches.";
      showToast(errorMsg, "error");
      return { success: false, message: errorMsg };
    }

    showToast(
      isOpen ? "All regional parlour branches marked as OPEN." : "All regional parlour branches marked as CLOSED.",
      isOpen ? "success" : "info"
    );
    return { success: true };
  };

  // 19. Vehicle Management Methods
  const addFleetVehicle = (data: { registrationNumber: string; modelOrType: string; capacityCrates?: number }) => {
    const reg = data.registrationNumber.trim().toUpperCase();
    if (!reg) {
      const msg = "Vehicle registration number cannot be blank.";
      showToast(msg, "error");
      return { success: false, message: msg };
    }
    if (fleetVehicles.some((v) => v.registrationNumber.trim().toUpperCase() === reg)) {
      const msg = `Vehicle with registration ${reg} already exists.`;
      showToast(msg, "error");
      return { success: false, message: msg };
    }
    const newVeh: FleetVehicle = {
      id: `veh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      registrationNumber: reg,
      modelOrType: data.modelOrType.trim() || "Reefer Van",
      capacityCrates: data.capacityCrates && data.capacityCrates > 0 ? data.capacityCrates : 24,
      status: "available",
    };
    const updated = [newVeh, ...fleetVehicles];
    setFleetVehicles(updated);
    persistState({ fleetVehicles: updated });
    showToast(`Vehicle ${newVeh.registrationNumber} registered successfully.`, "success");
    return { success: true, message: "Vehicle registered successfully.", vehicle: newVeh };
  };

  const updateFleetVehicle = (id: string, data: { registrationNumber: string; modelOrType: string; capacityCrates?: number }) => {
    const reg = data.registrationNumber.trim().toUpperCase();
    if (!reg) {
      const msg = "Vehicle registration number cannot be blank.";
      showToast(msg, "error");
      return { success: false, message: msg };
    }
    if (fleetVehicles.some((v) => v.id !== id && v.registrationNumber.trim().toUpperCase() === reg)) {
      const msg = `Another vehicle with registration ${reg} already exists.`;
      showToast(msg, "error");
      return { success: false, message: msg };
    }
    const updated = fleetVehicles.map((v) => {
      if (v.id !== id) return v;
      return {
        ...v,
        registrationNumber: reg,
        modelOrType: data.modelOrType.trim() || v.modelOrType,
        capacityCrates: data.capacityCrates && data.capacityCrates > 0 ? data.capacityCrates : v.capacityCrates,
      };
    });
    setFleetVehicles(updated);
    persistState({ fleetVehicles: updated });
    showToast(`Vehicle ${reg} details updated.`, "success");
    return { success: true, message: "Vehicle details updated successfully." };
  };

  const deleteFleetVehicle = (id: string) => {
    if (fleetVehicles.length <= 1) {
      const msg = "At least one fleet vehicle must remain registered.";
      showToast(msg, "error");
      return { success: false, message: msg };
    }
    const target = fleetVehicles.find((v) => v.id === id);
    const updated = fleetVehicles.filter((v) => v.id !== id);
    setFleetVehicles(updated);
    persistState({ fleetVehicles: updated });
    showToast(`Vehicle ${target?.registrationNumber || id} removed from registry.`, "info");
    return { success: true, message: "Vehicle removed successfully." };
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
        branches,
        toggleBranchOpenStatus,
        setAllBranchesOpenStatus,
        addProduct,
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
        updateDispatchTrip,
        markDispatchDeparted,
        updateDeliveryStop,
        receiveShipment,
        adjustInventory,
        toggleProductActive,
        saveProduct,
        resetDemoData,
        isHydrated,
        syncOrdersFromServer,
        syncDispatchesFromServer,
        fleetVehicles,
        addFleetVehicle,
        updateFleetVehicle,
        deleteFleetVehicle
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
