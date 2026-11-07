"use client";

import React, { useState, useMemo, useEffect } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdmin } from "@/context/AdminContext";
import {
  Truck,
  MapPin,
  CheckCircle2,
  Phone,
  Thermometer,
  Clock,
  Boxes,
  Plus,
  Minus,
  Check,
  Search,
  Package,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Sparkles,
  Lock,
  X,
  Edit2,
  Trash2,
  ArrowRight,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { OrderItem, DeliveryTripStatus, DispatchStop, FleetVehicle, DispatchBatch, StopDeliveryStatus, OrderStatus, AdminOrder } from "@/types/admin";
import { updateDispatchTripAction, DeliveredItemInput } from "@/lib/actions/dispatches";
import {
  calculateDispatchCargo,
  calculateStopCargo,
  resolveStopItems,
  formatCrateEquiv,
  STICKS_PER_CRATE,
  getItemCrates,
  getItemSticks,
} from "@/lib/actions/dispatch-helpers";

interface DeliveryStaffViewProps {
  userEmail?: string;
  driverId?: string;
  userRole?: string;
}

export function DeliveryStaffView({ userEmail, driverId, userRole }: DeliveryStaffViewProps) {
  const {
    dispatches,
    branches,
    orders,
    products,
    createDispatchBatch,
    updateDispatchTrip,
    updateDeliveryStop,
    markDispatchDeparted,
    demoRole,
    showToast,
    isHydrated,
    fleetVehicles,
    addFleetVehicle,
    updateFleetVehicle,
    deleteFleetVehicle,
    syncDispatchesFromServer,
    syncOrdersFromServer,
  } = useAdmin();

  const STORAGE_ACTIVE_DISPATCH_KEY = "icespot_active_dispatch_id";

  // Filter completed dispatches that ended more than 12 hours ago
  const isCompletedTripExpired = (dsp: DispatchBatch, nowMs: number = Date.now()): boolean => {
    if (dsp.status !== "completed") return false;
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

    // 1. Explicit completedAt timestamp on dispatch
    if (dsp.completedAt) {
      const t = new Date(dsp.completedAt).getTime();
      if (!isNaN(t)) {
        return (nowMs - t) >= TWELVE_HOURS_MS;
      }
    }

    // 2. Check stops completedAt
    if (dsp.stops && dsp.stops.length > 0) {
      const stopTimes = dsp.stops
        .map((s: DispatchStop) => (s.completedAt ? new Date(s.completedAt).getTime() : NaN))
        .filter((t: number) => !isNaN(t));
      if (stopTimes.length > 0) {
        const latest = Math.max(...stopTimes);
        return (nowMs - latest) >= TWELVE_HOURS_MS;
      }
    }

    // 3. Fallback to dispatchDate or departedAt if completed
    if (dsp.dispatchDate) {
      const fullDate = dsp.departureTime
        ? `${dsp.dispatchDate} ${dsp.departureTime}`
        : dsp.departedAt || dsp.dispatchDate;
      const t = new Date(fullDate).getTime();
      if (!isNaN(t)) {
        return (nowMs - t) >= TWELVE_HOURS_MS;
      }
    }

    return false;
  };

  const visibleDispatches = useMemo(() => {
    return dispatches.filter((dsp) => !isCompletedTripExpired(dsp));
  }, [dispatches]);

  // Active delivery batch: initial state is deterministic for SSR; hydrated from dispatches
  const [selectedDispatchId, setSelectedDispatchId] = useState<string>(() => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const serverActive = dispatches.find((d) => UUID_REGEX.test(d.id) && d.status !== "completed");
    const serverAny = dispatches.find((d) => UUID_REGEX.test(d.id));
    const inProgress = dispatches.find((d) => d.status !== "completed" && !isCompletedTripExpired(d));
    const firstNonExpired = dispatches.find((d) => !isCompletedTripExpired(d));
    return serverActive?.id || serverAny?.id || inProgress?.id || firstNonExpired?.id || dispatches[0]?.id || "";
  });

  // Ensure authoritative orders are synchronized from server on mount
  useEffect(() => {
    syncOrdersFromServer().catch(() => {});
  }, [syncOrdersFromServer]);

  // Keep selection synchronized once hydration completes
  useEffect(() => {
    if (isHydrated && typeof window !== "undefined") {
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const saved = localStorage.getItem(STORAGE_ACTIVE_DISPATCH_KEY);
      const serverActive = visibleDispatches.find((d) => UUID_REGEX.test(d.id) && d.status !== "completed");
      const eligible = visibleDispatches.find((d) => d.status !== "completed");

      if (saved && visibleDispatches.some((d) => d.id === saved)) {
        const matching = visibleDispatches.find((d) => d.id === saved)!;
        if (matching.status === "completed" && eligible) {
          setSelectedDispatchId(eligible.id);
          localStorage.setItem(STORAGE_ACTIVE_DISPATCH_KEY, eligible.id);
        } else {
          setSelectedDispatchId(matching.id);
        }
      } else if (serverActive) {
        setSelectedDispatchId(serverActive.id);
        localStorage.setItem(STORAGE_ACTIVE_DISPATCH_KEY, serverActive.id);
      } else if (eligible) {
        setSelectedDispatchId(eligible.id);
        localStorage.setItem(STORAGE_ACTIVE_DISPATCH_KEY, eligible.id);
      } else if (visibleDispatches[0]) {
        setSelectedDispatchId(visibleDispatches[0].id);
      }
    }
  }, [isHydrated, visibleDispatches]);

  const handleSelectDispatch = (dispatchId: string) => {
    setSelectedDispatchId(dispatchId);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_ACTIVE_DISPATCH_KEY, dispatchId);
    }
    const target = dispatches.find((d) => d.id === dispatchId);
    if (target && target.stops && target.stops.length > 0) {
      const branchIds = target.stops.map((s) => s.branchId);
      setSelectedBranchIds(branchIds);
      setActiveBranchId(branchIds[0]);
    } else if (target) {
      setSelectedBranchIds([]);
      setActiveBranchId("");
    }
  };

  const activeDispatch =
    visibleDispatches.find((d) => d.id === selectedDispatchId) ||
    visibleDispatches.find((d) => d.status !== "completed") ||
    visibleDispatches[0] ||
    dispatches.find((d) => d.id === selectedDispatchId) ||
    dispatches[0];
  const isTripLocked = activeDispatch?.status === "completed";
  const isTripInTransit = activeDispatch?.status === "in-transit";
  const eligibleDispatch =
    visibleDispatches.find((d) => d.status !== "completed") ||
    dispatches.find((d) => d.status !== "completed");

  // Keep route stops and active branch in sync with activeDispatch
  useEffect(() => {
    if (activeDispatch?.stops && activeDispatch.stops.length > 0) {
      const branchIds = activeDispatch.stops.map((s) => s.branchId);
      setSelectedBranchIds(branchIds);
      setActiveBranchId((curr) => (branchIds.includes(curr) ? curr : branchIds[0]));
    }
  }, [activeDispatch?.id, activeDispatch?.stops?.length]);

  // SECTION 1 FORM STATES
  const [vehicleNumber, setVehicleNumber] = useState<string>(
    activeDispatch?.vehicleNumber || "KL-08-AX-4412 (Insulated Reefer Van)"
  );
  const [departureTime, setDepartureTime] = useState<string>(
    activeDispatch?.departureTime ||
      (activeDispatch?.departedAt
        ? activeDispatch.departedAt.replace(/^\d{4}-\d{2}-\d{2}[T\s]+/, "")
        : "")
  );
  const [tripStatus, setTripStatus] = useState<DeliveryTripStatus>(
    activeDispatch?.status || "in-transit"
  );
  const [tripNotes, setTripNotes] = useState<string>(
    activeDispatch?.notes || ""
  );
  const [orderFilter, setOrderFilter] = useState<"all" | OrderStatus>("all");
  const [activeSection, setActiveSection] = useState<string>("VEHICLE DISPATCH & TRIP SETUP");

  // VEHICLE & SET DELIVERY MODAL STATE
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehRegInput, setVehRegInput] = useState("");
  const [vehTypeInput, setVehTypeInput] = useState("");
  const [vehCapacityInput, setVehCapacityInput] = useState(55);
  const [vehFormError, setVehFormError] = useState<string | null>(null);

  // Set Delivery Trip fields inside modal
  const [newDeliveryVehicle, setNewDeliveryVehicle] = useState("");
  const [newDeliveryModel, setNewDeliveryModel] = useState("Insulated Reefer Van");
  const [newDeliveryTime, setNewDeliveryTime] = useState("12:45 PM");
  const [newDeliveryBranches, setNewDeliveryBranches] = useState<string[]>([]);
  const [newDeliveryCrates, setNewDeliveryCrates] = useState(55);
  const [newDeliveryNotes, setNewDeliveryNotes] = useState("");
  const [deliveryTab, setDeliveryTab] = useState<"set-delivery" | "fleet-registry">("set-delivery");

  const handleOpenVehicleModal = (preselectedBranchId?: string) => {
    syncOrdersFromServer().catch(() => {});
    setVehFormError(null);
    setEditingVehicleId(null);
    const defaultReg = fleetVehicles[0]?.registrationNumber || "KL-09-AQ-9955";
    const defaultModel = fleetVehicles[0]?.modelOrType || "Insulated Reefer Van";
    const defaultCrates = fleetVehicles[0]?.capacityCrates || 55;
    setVehRegInput(defaultReg);
    setVehTypeInput(defaultModel);
    setVehCapacityInput(defaultCrates);
    setNewDeliveryVehicle(defaultReg);
    setNewDeliveryModel(defaultModel);
    setNewDeliveryTime("12:45 PM");
    const preselected = preselectedBranchId
      ? [preselectedBranchId]
      : eligibleBranches.length > 0
      ? [eligibleBranches[0].branch.id]
      : [];
    setNewDeliveryBranches(preselected);
    setNewDeliveryCrates(defaultCrates);
    setNewDeliveryNotes("");
    setIsVehicleModalOpen(true);
  };

  const handleSelectEarlierVehicle = (veh: FleetVehicle) => {
    setNewDeliveryVehicle(veh.registrationNumber);
    setNewDeliveryModel(veh.modelOrType);
    setNewDeliveryCrates(veh.capacityCrates);
    setVehRegInput(veh.registrationNumber);
    setVehTypeInput(veh.modelOrType);
    setVehCapacityInput(veh.capacityCrates);
    showToast(`Loaded ${veh.registrationNumber} details`, "info");
  };

  // Helper: check if branch identifier (slug or UUID or name) matches order/branch
  const isBranchMatch = (
    branchIdentifier: string,
    orderBranchId?: string,
    orderBranchName?: string,
    orderBranchCode?: string
  ): boolean => {
    if (!branchIdentifier) return false;
    const bLower = branchIdentifier.toLowerCase().trim();
    const idLower = (orderBranchId || "").toLowerCase().trim();
    const nameLower = (orderBranchName || "").toLowerCase().trim();
    const codeLower = (orderBranchCode || "").toLowerCase().trim();

    // 1. Direct ID match
    if (bLower && idLower && bLower === idLower) return true;

    // 2. Code match
    if (codeLower && (bLower.includes(codeLower) || codeLower.includes(bLower))) return true;

    // 3. Name slug match
    const clean = (s: string) =>
      s
        .toLowerCase()
        .replace(/ice\s*spot/g, "")
        .replace(/branch/g, "")
        .replace(/parlour/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();

    const bClean = clean(bLower);
    const nClean = clean(nameLower);
    if (bClean && nClean && (bClean === nClean || bClean.includes(nClean) || nClean.includes(bClean))) {
      return true;
    }

    // 4. Compare with known catalog branches
    const catalogBranch = branches.find((b) => b.id.toLowerCase() === bLower || clean(b.name) === bClean);
    if (catalogBranch) {
      const catClean = clean(catalogBranch.name);
      if (catClean && nClean && (catClean === nClean || catClean.includes(nClean) || nClean.includes(catClean))) {
        return true;
      }
    }

    return false;
  };

  // Helper to get branch details safely with UUID and slug resolution
  const getBranchDetails = (id: string) => {
    const direct = branches.find((b) => b.id === id);
    if (direct) return direct;

    const matchedBranch = branches.find((b) => isBranchMatch(id, b.id, b.name));
    if (matchedBranch) return matchedBranch;

    const matchedOrder = orders.find((o) => o.branchId === id);
    if (matchedOrder) {
      return {
        id,
        name: matchedOrder.branchName || "Ice Spot Branch",
        district: "Thrissur",
        location: "Kerala, India",
        phone: "+91 94470 00000",
      };
    }

    const matchedStop = activeDispatch?.stops?.find((s) => s.branchId === id);
    if (matchedStop && matchedStop.branchName) {
      return {
        id,
        name: matchedStop.branchName,
        district: matchedStop.district || "Thrissur",
        location: matchedStop.address || "Kerala, India",
        phone: matchedStop.phone || "+91 94470 00000",
      };
    }

    return {
      id,
      name: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      district: "Thrissur",
      location: "Kerala, India",
      phone: "+91 94470 00000",
    };
  };

  const getBranchAndEligibleOrder = (
    branchIdOrSlug: string
  ): {
    branch: ReturnType<typeof getBranchDetails>;
    eligibleOrder?: AdminOrder;
    ineligibleReason?: string;
  } => {
    const branch = getBranchDetails(branchIdOrSlug);
    // Find all orders for this branch
    const branchOrders = orders.filter((o) =>
      isBranchMatch(branchIdOrSlug, o.branchId, o.branchName, o.branchCode)
    );

    // Find approved orders eligible for dispatch (not already dispatched or delivered)
    const approvedOrders = branchOrders.filter(
      (o) =>
        (o.status === "approved" || o.status === "preparation" || o.status === "ready-for-dispatch") &&
        !o.assignedDispatchId
    );

    if (approvedOrders.length > 0) {
      // Prioritize genuine database UUID orders over mock string IDs (ord-xxx)
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const serverApproved = approvedOrders.filter((o) => UUID_REGEX.test(o.id));
      if (serverApproved.length > 0) {
        return { branch, eligibleOrder: serverApproved[serverApproved.length - 1] };
      }
      return { branch, eligibleOrder: approvedOrders[approvedOrders.length - 1] };
    }

    // If an order exists for this branch but is ineligible, explain the actual reason
    if (branchOrders.length > 0) {
      const latestOrder = branchOrders[branchOrders.length - 1];
      let reason = `Order #${latestOrder.orderNumber || latestOrder.id} is not eligible for dispatch.`;
      if (latestOrder.status === "delivered") {
        reason = `Order #${latestOrder.orderNumber || latestOrder.id} has already been delivered.`;
      } else if (latestOrder.status === "dispatched" || latestOrder.assignedDispatchId) {
        reason = `Order #${latestOrder.orderNumber || latestOrder.id} has already been dispatched.`;
      } else if (latestOrder.items && latestOrder.items.length > 0 && latestOrder.items.every((it) => (it.approvedPacks || 0) === 0)) {
        reason = `Order #${latestOrder.orderNumber || latestOrder.id} has no approved quantities. Super Admin must approve items before scheduling delivery.`;
      } else if (latestOrder.status === "cancelled") {
        reason = `Order #${latestOrder.orderNumber || latestOrder.id} was cancelled.`;
      } else if (latestOrder.status === "submitted" || latestOrder.status === "under-review") {
        reason = `Order #${latestOrder.orderNumber || latestOrder.id} is awaiting Super Admin approval.`;
      }
      return { branch, eligibleOrder: undefined, ineligibleReason: reason };
    }

    // Never fall back to unapproved mock orders. If no order exists, explain clearly.
    return {
      branch,
      eligibleOrder: undefined,
      ineligibleReason: `No requisition orders found for ${branch.name}. Super Admin must approve a branch requisition before scheduling delivery.`,
    };
  };

  // Computed eligible branches backed by genuine approved, unassigned orders
  const eligibleBranches = useMemo(() => {
    const list: Array<{
      branch: ReturnType<typeof getBranchDetails>;
      order: AdminOrder;
      totalCrates: number;
      totalSticks: number;
    }> = [];

    branches.forEach((br) => {
      const { branch, eligibleOrder } = getBranchAndEligibleOrder(br.id);
      if (
        eligibleOrder &&
        (eligibleOrder.status === "approved" ||
          eligibleOrder.status === "preparation" ||
          eligibleOrder.status === "ready-for-dispatch") &&
        !eligibleOrder.assignedDispatchId
      ) {
        const crates = eligibleOrder.items.reduce(
          (sum, it) => sum + getItemCrates(it),
          0
        );
        list.push({
          branch,
          order: eligibleOrder,
          totalCrates: crates,
          totalSticks: crates * 10,
        });
      }
    });

    return list;
  }, [branches, orders]);

  const [isSubmittingDispatchModal, setIsSubmittingDispatchModal] = useState(false);

  const handleSetDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    setVehFormError(null);
    const reg = (newDeliveryVehicle || vehRegInput).trim().toUpperCase();
    if (!reg) {
      setVehFormError("Vehicle registration number is required.");
      return;
    }
    if (newDeliveryBranches.length === 0) {
      setVehFormError("Please select at least 1 destination branch.");
      return;
    }

    // Resolve eligible orders for selected destination branches
    const eligibleOrders: AdminOrder[] = [];
    const missingReasons: string[] = [];

    for (const bId of newDeliveryBranches) {
      const { branch, eligibleOrder, ineligibleReason } = getBranchAndEligibleOrder(bId);
      if (
        eligibleOrder &&
        (eligibleOrder.status === "approved" ||
          eligibleOrder.status === "preparation" ||
          eligibleOrder.status === "ready-for-dispatch")
      ) {
        if (!eligibleOrders.some((o) => o.id === eligibleOrder.id)) {
          eligibleOrders.push(eligibleOrder);
        }
      } else {
        missingReasons.push(ineligibleReason || `${branch.name}: No approved order`);
      }
    }

    if (eligibleOrders.length === 0) {
      setVehFormError(missingReasons.join(" "));
      return;
    }

    setIsSubmittingDispatchModal(true);

    try {
      const fullVehicleStr = `${reg} (${(newDeliveryModel || vehTypeInput).trim() || "Insulated Reefer Van"})`;
      const depTimeStr = newDeliveryTime.trim() || "12:45 PM";

      const res = await createDispatchBatch({
        vehicleNumber: fullVehicleStr,
        driverId: driverId || "",
        driverName: userEmail || "Delivery Staff",
        orderIds: eligibleOrders.map((o) => o.id),
        notes: newDeliveryNotes.trim() || undefined,
        departureTime: depTimeStr,
      });

      if (typeof res === "object" && !res.success) {
        setVehFormError(res.message || "Failed to create dispatch.");
        setIsSubmittingDispatchModal(false);
        return;
      }

      const createdDispatchId = typeof res === "object" ? res.dispatchId : res;
      const manifestNumber = typeof res === "object" ? res.manifestNumber : undefined;

      // Ensure vehicle is in fleet registry
      if (!fleetVehicles.some((v) => v.registrationNumber.toUpperCase() === reg)) {
        addFleetVehicle({
          registrationNumber: reg,
          modelOrType: (newDeliveryModel || vehTypeInput).trim() || "Insulated Reefer Van",
          capacityCrates: newDeliveryCrates > 0 ? newDeliveryCrates : 24,
        });
      }

      if (createdDispatchId) {
        handleSelectDispatch(createdDispatchId);
      }

      setIsVehicleModalOpen(false);
      showToast(
        `Delivery trip ${manifestNumber || ""} scheduled for ${reg}!`.trim(),
        "success"
      );
    } catch (err: any) {
      setVehFormError(err?.message || "Failed to create delivery trip.");
    } finally {
      setIsSubmittingDispatchModal(false);
    }
  };

  const handleStartEditVehicle = (veh: FleetVehicle) => {
    setEditingVehicleId(veh.id);
    setVehRegInput(veh.registrationNumber);
    setVehTypeInput(veh.modelOrType);
    setVehCapacityInput(veh.capacityCrates);
    setVehFormError(null);
  };

  const handleCancelEditVehicle = () => {
    setEditingVehicleId(null);
    setVehRegInput("");
    setVehTypeInput("");
    setVehCapacityInput(24);
    setVehFormError(null);
  };

  const handleSaveVehicleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const reg = vehRegInput.trim().toUpperCase();
    if (!reg) {
      setVehFormError("Registration number cannot be blank.");
      return;
    }
    if (
      fleetVehicles.some(
        (v) => v.id !== editingVehicleId && v.registrationNumber.trim().toUpperCase() === reg
      )
    ) {
      setVehFormError(`Registration number ${reg} already exists.`);
      return;
    }

    if (editingVehicleId) {
      const res = updateFleetVehicle(editingVehicleId, {
        registrationNumber: reg,
        modelOrType: vehTypeInput.trim() || "Reefer Van",
        capacityCrates: vehCapacityInput > 0 ? vehCapacityInput : 24,
      });
      if (!res.success) {
        setVehFormError(res.message);
        return;
      }
    } else {
      const res = addFleetVehicle({
        registrationNumber: reg,
        modelOrType: vehTypeInput.trim() || "Reefer Van",
        capacityCrates: vehCapacityInput > 0 ? vehCapacityInput : 24,
      });
      if (!res.success) {
        setVehFormError(res.message);
        return;
      }
    }

    setEditingVehicleId(null);
    setVehRegInput("");
    setVehTypeInput("");
    setVehCapacityInput(24);
    setVehFormError(null);
  };

  const handleSelectVehicleForTrip = (veh: FleetVehicle) => {
    if (isTripLocked) {
      showToast("Cannot change vehicle on a completed dispatch.", "error");
      return;
    }
    const formatted = `${veh.registrationNumber} (${veh.modelOrType})`;
    setVehicleNumber(formatted);
    showToast(`Selected vehicle ${veh.registrationNumber} for trip`, "success");
    setIsVehicleModalOpen(false);
  };

  // Selected Branches: initialize with stops from active dispatch
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(() => {
    if (activeDispatch?.stops && activeDispatch.stops.length > 0) {
      return activeDispatch.stops.map((s) => s.branchId);
    }
    return [];
  });

  const stopsFingerprint = activeDispatch?.stops?.map((s) => s.branchId).join(",") || "";

  // Sync form states whenever selected dispatch or hydrated context data changes
  useEffect(() => {
    if (activeDispatch) {
      setVehicleNumber(activeDispatch.vehicleNumber || "KL-08-AX-4412 (Insulated Reefer Van)");
      setDepartureTime(
        activeDispatch.departureTime ||
          (activeDispatch.departedAt
            ? activeDispatch.departedAt.replace(/^\d{4}-\d{2}-\d{2}[T\s]+/, "")
            : "")
      );
      setTripStatus(activeDispatch.status || "in-transit");
      setTripNotes(activeDispatch.notes || "");
      if (activeDispatch.stops && activeDispatch.stops.length > 0) {
        const branchIds = activeDispatch.stops.map((s) => s.branchId);
        setSelectedBranchIds(branchIds);
        setActiveBranchId((curr) => (branchIds.includes(curr) ? curr : branchIds[0]));
        const stopStatusMap: Record<string, "scheduled" | "in-transit" | "delivered"> = {};
        activeDispatch.stops.forEach((s) => {
          stopStatusMap[s.branchId] = s.status === "delivered" ? "delivered" : s.status === "in-transit" ? "in-transit" : "scheduled";
        });
        setBranchStopStatus(stopStatusMap);
      } else {
        setSelectedBranchIds([]);
        setActiveBranchId("");
        setBranchStopStatus({});
      }
    }
  }, [
    activeDispatch?.id,
    activeDispatch?.departureTime,
    activeDispatch?.vehicleNumber,
    activeDispatch?.status,
    activeDispatch?.departedAt,
    activeDispatch?.notes,
    stopsFingerprint,
    isHydrated,
  ]);

  const [isBranchPickerOpen, setIsBranchPickerOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");

  // SECTION 2 ACTIVE SELECTION STATE (which branch is selected for Section 3)
  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    return activeDispatch?.stops?.[0]?.branchId || "";
  });

  // Track delivery status for each branch stop: branchId -> 'scheduled' | 'in-transit' | 'delivered'
  const [branchStopStatus, setBranchStopStatus] = useState<Record<string, "scheduled" | "in-transit" | "delivered">>(() => {
    const initial: Record<string, "scheduled" | "in-transit" | "delivered"> = {};
    if (activeDispatch?.stops) {
      activeDispatch.stops.forEach((s) => {
        initial[s.branchId] = s.status === "delivered" ? "delivered" : s.status === "in-transit" ? "in-transit" : "scheduled";
      });
    }
    return initial;
  });

  // Checkbox verification state for product checklist in Section 3
  const [verifiedProducts, setVerifiedProducts] = useState<Record<string, boolean>>({});

  // Helper: total calculated crates across active dispatch stops derived strictly from stop items
  const calculatedTotalCrates = useMemo(() => {
    if (!activeDispatch) return 0;
    return calculateDispatchCargo(activeDispatch, orders).crates;
  }, [activeDispatch, orders]);

  // Section 1: Total Crates in Vehicle (calculated from actual stop items)
  const totalCrates = calculatedTotalCrates;

  // Toggle a branch in Section 1
  const handleToggleBranchSelection = (branchId: string) => {
    setSelectedBranchIds((prev) => {
      let updated: string[];
      if (prev.includes(branchId)) {
        if (prev.length === 1) {
          showToast("At least 1 delivery branch must be selected for the trip", "error");
          return prev;
        }
        updated = prev.filter((id) => id !== branchId);
        // If unselected was the active one, switch to the first remaining
        if (activeBranchId === branchId && updated.length > 0) {
          setActiveBranchId(updated[0]);
        }
      } else {
        updated = [...prev, branchId];
        // If no active branch, set it
        if (!activeBranchId) {
          setActiveBranchId(branchId);
        }
      }
      return updated;
    });
  };

  // Helper: get products for the branch in Section 3
  // Derives products strictly from active dispatch stop cargo or matched eligible order. Never returns mock flavours.
  const activeBranchOrderProducts = useMemo(() => {
    if (!activeBranchId) return [];

    const matchedStop = activeDispatch?.stops?.find(
      (s) => isBranchMatch(activeBranchId, s.branchId, s.branchName)
    );

    const targetStop: DispatchStop = matchedStop || {
      id: `temp-${activeBranchId}`,
      orderId: "",
      orderNumber: "",
      branchId: activeBranchId,
      branchName: branches.find((b) => isBranchMatch(activeBranchId, b.id, b.name))?.name || "Ice Spot Branch",
      district: "",
      address: "",
      phone: "",
      sequence: 1,
      items: [],
      status: "scheduled",
    };

    const resolved = resolveStopItems(targetStop, activeDispatch, orders);
    if (resolved && resolved.length > 0) {
      return resolved;
    }

    // Fallback: Check eligible order for branch if still empty
    const { eligibleOrder } = getBranchAndEligibleOrder(activeBranchId);
    if (eligibleOrder && eligibleOrder.items && eligibleOrder.items.length > 0) {
      return eligibleOrder.items;
    }

    // Return empty array - do NOT generate mock flavours!
    return [];
  }, [activeBranchId, orders, activeDispatch, branches]);

  // Return quantity state: Record<"branchId-productId", number | "">
  const [returnedQuantities, setReturnedQuantities] = useState<Record<string, number | "">>({});

  // Reset returned quantities when branch changes
  useEffect(() => {
    if (activeBranchId) {
      const defaults: Record<string, number | ""> = {};
      activeBranchOrderProducts.forEach((item, idx) => {
        const key = `${activeBranchId}-${item.productId || idx}`;
        defaults[key] = 0;
      });
      setReturnedQuantities(defaults);
    }
  }, [activeBranchId, activeBranchOrderProducts.length]);

  // Submission guard state
  const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);
  const [deliverySubmitError, setDeliverySubmitError] = useState<string | null>(null);

  // Validation helper: Check if all returned quantities (in sticks) are valid
  const returnQuantityValidation = useMemo(() => {
    const errors: Record<string, string> = {};
    let hasAnyError = false;

    activeBranchOrderProducts.forEach((item, idx) => {
      const key = `${activeBranchId}-${item.productId || idx}`;
      const rawVal = returnedQuantities[key];
      const unitsPerPack = item.requestedUnits && item.requestedPacks
        ? Math.round(item.requestedUnits / item.requestedPacks)
        : STICKS_PER_CRATE;
      const assignedCrates = getItemCrates(item);
      const assignedSticks = getItemSticks(item, unitsPerPack);

      if (rawVal === "" || rawVal === undefined) {
        // Empty is treated as 0 for calculation, not an error
        return;
      }

      const numVal = Number(rawVal);
      if (isNaN(numVal) || !isFinite(numVal)) {
        errors[key] = "Must be a valid number";
        hasAnyError = true;
      } else if (numVal < 0) {
        errors[key] = "Cannot be negative";
        hasAnyError = true;
      } else if (!Number.isInteger(numVal)) {
        errors[key] = "Must be a whole number of sticks";
        hasAnyError = true;
      } else if (numVal > assignedSticks) {
        errors[key] = `Cannot exceed assigned sticks (${assignedSticks})`;
        hasAnyError = true;
      }
    });

    return { errors, hasAnyError };
  }, [returnedQuantities, activeBranchOrderProducts, activeBranchId]);

  // Handle Mark Stop Delivered — passes delivered items with return quantities in sticks and crate equivalents
  const handleMarkStopDelivered = async (branchId: string, branchName: string) => {
    if (isSubmittingDelivery) return;

    // Validate returned quantities
    if (returnQuantityValidation.hasAnyError) {
      showToast("Please fix quantity errors before confirming delivery.", "error");
      return;
    }

    setIsSubmittingDelivery(true);
    setDeliverySubmitError(null);

    try {
      // Build delivered items array from the products and return quantities in sticks
      const itemsForDelivery = activeBranchOrderProducts.map((item, idx) => {
        const key = `${branchId}-${item.productId || idx}`;
        const rawReturned = returnedQuantities[key];
        const returnedSticks = (rawReturned === "" || rawReturned === undefined) ? 0 : Number(rawReturned);
        const unitsPerPack = item.requestedUnits && item.requestedPacks
          ? Math.round(item.requestedUnits / item.requestedPacks)
          : 10;
        const assignedCrates = getItemCrates(item);
        const assignedSticks = getItemSticks(item, unitsPerPack);
        const deliveredSticks = Math.max(0, assignedSticks - returnedSticks);

        // Convert returned and delivered sticks into crate equivalents for backend fields
        const returnedCratesEquiv = Number((returnedSticks / unitsPerPack).toFixed(2));
        const deliveredCratesEquiv = Number((deliveredSticks / unitsPerPack).toFixed(2));

        return {
          productId: item.productId,
          quantityDelivered: deliveredCratesEquiv,
          shortageQuantity: returnedCratesEquiv,
          deliveredSticks,
          returnedSticks,
        };
      });

      const totalDeliveredUnits = itemsForDelivery.reduce((sum, it) => sum + it.deliveredSticks, 0);

      const hasShortage = itemsForDelivery.some((it) => it.returnedSticks > 0);
      const deliveryStatus = hasShortage ? "partially-delivered" as const : "delivered" as const;
      const shortageNote = hasShortage
        ? `Partial delivery with returns: ${itemsForDelivery.filter(it => it.returnedSticks > 0).map(it => {
            const prod = activeBranchOrderProducts.find(p => p.productId === it.productId);
            const unitsPerPack = 10;
            const crStr = formatCrateEquiv(it.returnedSticks, unitsPerPack);
            return `${prod?.productName || it.productId}: ${it.returnedSticks} stick(s) returned (${crStr} crates)`;
          }).join("; ")}`
        : "Handover verified frozen at -18.4°C";

      if (!activeDispatch) {
        throw new Error("No active dispatch trip selected.");
      }

      // If matching dispatch stop exists in context, update it
      const matchingStop = activeDispatch.stops?.find((s) =>
        isBranchMatch(branchId, s.branchId, s.branchName) ||
        s.branchId === branchId ||
        s.orderId === branchId
      );

      if (!matchingStop) {
        throw new Error(`Could not find route stop for branch "${branchName}".`);
      }

      const res = await updateDeliveryStop(
        activeDispatch.id,
        matchingStop.orderId,
        deliveryStatus,
        totalDeliveredUnits,
        shortageNote,
        hasShortage ? "Returned stock" : undefined,
        itemsForDelivery
      );
      if (!res.success) {
        throw new Error(res.message);
      }

      setBranchStopStatus((prev) => ({
        ...prev,
        [branchId]: "delivered"
      }));

      showToast(`Delivery handover confirmed at ${branchName}${hasShortage ? " (with returns)" : ""}`, "success");
    } catch (err: any) {
      setDeliverySubmitError(err?.message || "Failed to confirm delivery");
      showToast(`Delivery confirmation failed: ${err?.message || "Unknown error"}`, "error");
    } finally {
      setIsSubmittingDelivery(false);
    }
  };

  // Active branch object
  const activeBranch = useMemo(() => {
    return getBranchDetails(activeBranchId);
  }, [activeBranchId, branches]);

  // Filtered branches for the branch selector modal/dropdown
  const filteredBranches = useMemo(() => {
    if (!branchSearch.trim()) return branches;
    const q = branchSearch.toLowerCase();
    return branches.filter(
      (b) => b.name.toLowerCase().includes(q) || b.district.toLowerCase().includes(q) || b.location.toLowerCase().includes(q)
    );
  }, [branches, branchSearch]);

  // Helper to build updated stops list preserving branch order, existing stop IDs, and item allocations
  const buildUpdatedStops = (forceStopStatus?: "in-transit"): DispatchStop[] => {
    return selectedBranchIds.map((branchId, index) => {
      const existingStop = activeDispatch?.stops?.find((s) => isBranchMatch(branchId, s.branchId, s.branchName));
      const defaultStopStatus: StopDeliveryStatus = forceStopStatus || branchStopStatus[branchId] || "scheduled";
      const finalStatus: StopDeliveryStatus = branchStopStatus[branchId] === "delivered" ? "delivered" : defaultStopStatus;

      const { branch, eligibleOrder } = getBranchAndEligibleOrder(branchId);

      if (existingStop) {
        return {
          ...existingStop,
          sequence: index + 1,
          phone: existingStop.phone || branch.phone || "+91 94470 00000",
          status: finalStatus,
          items: existingStop.items && existingStop.items.length > 0 ? existingStop.items : (eligibleOrder?.items || []),
        };
      }

      return {
        id: `stop-${activeDispatch?.id || "dsp-089"}-${branchId}`,
        orderId: eligibleOrder?.id || `ord-${branchId}`,
        orderNumber: eligibleOrder?.orderNumber || `ORD-2026-${branchId.slice(0, 4).toUpperCase()}`,
        branchId: branch.id,
        branchName: branch.name,
        district: branch.district,
        address: branch.location,
        phone: branch.phone || "+91 94470 00000",
        sequence: index + 1,
        items: eligibleOrder?.items && eligibleOrder.items.length > 0 ? eligibleOrder.items : [],
        status: finalStatus,
      };
    });
  };

  const checkFleetVehicleAuthorization = (): boolean => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isSuperAdmin =
      userRole?.toLowerCase().replace(/-/g, "_") === "super_admin" ||
      demoRole === "super-admin";
    if (
      !isSuperAdmin &&
      UUID_REGEX.test(activeDispatch?.id || "") &&
      activeDispatch?.vehicleNumber &&
      vehicleNumber !== activeDispatch.vehicleNumber
    ) {
      showToast("Unauthorized: Fleet vehicle reassignment requires Super Admin authority.", "error");
      return false;
    }
    return true;
  };

  // 1. Save Trip Details Handler (independent save without dispatching orders)
  const [isSavingDispatch, setIsSavingDispatch] = useState(false);
  const handleSaveTripDetails = async () => {
    if (activeDispatch?.status === "completed") {
      showToast("Cannot modify a completed dispatch. Completed trips are locked.", "error");
      return;
    }
    const cleanVeh = (vehicleNumber || "").trim();
    if (!cleanVeh) {
      showToast("Vehicle registration number is required.", "error");
      return;
    }
    const cleanDepTime = (departureTime || "").trim();
    if (!cleanDepTime) {
      showToast("Scheduled departure time is required.", "error");
      return;
    }
    if (selectedBranchIds.length === 0) {
      showToast("Please select at least 1 destination branch for the trip.", "error");
      return;
    }
    if (!checkFleetVehicleAuthorization()) return;

    setIsSavingDispatch(true);
    try {
      const updatedStops = buildUpdatedStops();
      const calculatedTotalUnits = updatedStops.reduce(
        (sum, s) => sum + (s.items ? s.items.reduce((iSum, it) => iSum + (it.packedUnits || it.requestedUnits || ((it.approvedPacks ?? it.requestedPacks ?? 0) * STICKS_PER_CRATE)), 0) : 0),
        0
      );
      const totalUnitsToSave = calculatedTotalUnits || activeDispatch?.totalUnits || 0;

      if (activeDispatch?.id) {
        updateDispatchTrip(activeDispatch.id, {
          vehicleNumber: cleanVeh,
          departureTime: cleanDepTime,
          status: activeDispatch.status, // Preserve existing status (does NOT mark departed or change order statuses)
          notes: tripNotes,
          stops: updatedStops,
          totalUnits: totalUnitsToSave,
        });
      }

      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (activeDispatch?.id && UUID_REGEX.test(activeDispatch.id)) {
        const result = await updateDispatchTripAction({
          dispatchId: activeDispatch.id,
          vehicleNumber: cleanVeh,
          departureTime: cleanDepTime,
          status: activeDispatch.status,
          notes: tripNotes,
        });

        if (!result.success) {
          showToast(`Server update failed: ${result.message}`, "error");
          setIsSavingDispatch(false);
          return;
        }
      }

      showToast(`Trip configuration saved for ${cleanVeh}`, "success");
    } catch (err: any) {
      showToast(`Failed to save dispatch: ${err.message || "Unknown error"}`, "error");
    } finally {
      setIsSavingDispatch(false);
    }
  };

  // 2. Save & Dispatch Order Handler (dispatches eligible trip & marks linked orders as dispatched)
  const [isDispatchingOrder, setIsDispatchingOrder] = useState(false);
  const handleSaveAndDispatchOrder = async (targetDispatchId?: string) => {
    if (isDispatchingOrder) return;

    const targetId = targetDispatchId || selectedDispatchId;
    const target = dispatches.find((d) => d.id === targetId) || activeDispatch;

    if (!target) {
      showToast("No dispatch trip selected.", "error");
      return;
    }

    if (target.status === "completed") {
      showToast("Cannot dispatch a completed trip. This trip has already concluded.", "error");
      return;
    }

    if (target.status === "in-transit") {
      showToast("This trip is already in transit and en route.", "info");
      return;
    }

    // Always ensure target dispatch is selected in UI so Section 2 and 3 synchronize immediately
    handleSelectDispatch(target.id);

    const currentVeh = (target.vehicleNumber || vehicleNumber || "").trim();
    const currentDepTime = (target.departureTime || target.departedAt || departureTime || "").trim();

    // Build stops for target, ensuring all non-delivered stops are marked in-transit
    const baseStops: DispatchStop[] = (target.stops && target.stops.length > 0) ? target.stops : buildUpdatedStops("in-transit");
    const currentStops: DispatchStop[] = baseStops.map((s) => ({
      ...s,
      phone: s.phone || "+91 94470 00000",
      status: s.status === "delivered" ? ("delivered" as const) : ("in-transit" as const),
    }));

    if (currentStops.length === 0) {
      showToast("Please ensure at least 1 destination branch is assigned before dispatching.", "error");
      return;
    }
    if (!currentVeh) {
      showToast("Vehicle number is required to dispatch the trip.", "error");
      return;
    }
    if (!currentDepTime) {
      showToast("Departure time is required to dispatch the trip.", "error");
      return;
    }
    if (!checkFleetVehicleAuthorization()) return;

    setIsDispatchingOrder(true);
    try {
      const calculatedTotalUnits = currentStops.reduce(
        (sum, s) => sum + (s.items ? s.items.reduce((iSum, it) => iSum + (it.packedUnits || it.requestedUnits || ((it.approvedPacks ?? it.requestedPacks ?? 0) * STICKS_PER_CRATE)), 0) : 0),
        0
      );
      const totalUnitsToSave = calculatedTotalUnits || target.totalUnits || 0;

      // Update stop status mapping in React state
      setBranchStopStatus((prev) => {
        const next = { ...prev };
        currentStops.forEach((s) => {
          if (next[s.branchId] !== "delivered") {
            next[s.branchId] = "in-transit";
          }
        });
        return next;
      });
      setTripStatus("in-transit");

      // Depart dispatch and transition all linked orders to "dispatched"
      markDispatchDeparted(target.id, {
        vehicleNumber: currentVeh,
        departureTime: currentDepTime,
        notes: target.notes || tripNotes,
        stops: currentStops,
        totalUnits: totalUnitsToSave,
      });

      // If registered Supabase dispatch, update database status
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (UUID_REGEX.test(target.id)) {
        const result = await updateDispatchTripAction({
          dispatchId: target.id,
          vehicleNumber: currentVeh,
          departureTime: currentDepTime,
          status: "in-transit",
          notes: target.notes || tripNotes,
        });

        if (!result.success) {
          showToast(`Server dispatch update failed: ${result.message}`, "error");
          setIsDispatchingOrder(false);
          return;
        }
      }

      showToast(
        `Order dispatched successfully! Vehicle ${currentVeh} departed with ${target.manifestNumber || "Manifest"}.`,
        "success"
      );
    } catch (err: any) {
      showToast(`Failed to dispatch order: ${err.message || "Unknown error"}`, "error");
    } finally {
      setIsDispatchingOrder(false);
    }
  };

  return (
    <AdminShell
      title="Youback Icespot Factory"
      subtitle="Reefer Fleet Logistics & Parlour Dispatch System"
      roleBadgeText="STAFF ADMIN"
      roleBadgeColor="sky"
      userEmail={userEmail}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      <div className="space-y-5 sm:space-y-6 w-full max-w-full">
        {/* ========================================================================= */}
        {/* SECTION 1: VEHICLE DISPATCH & TRIP SETUP                                  */}
        {/* Entering: vehicle number, time, delivering branches, total crates in van   */}
        {/* ========================================================================= */}
        {activeSection === "VEHICLE DISPATCH & TRIP SETUP" && (
          <section className="bg-white rounded-2xl sm:rounded-[24px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-4 sm:p-6 transition-all">
          {/* Section 1 Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 sm:pb-5 sm:mb-5 border-b border-slate-100 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 text-sky-700 flex items-center justify-center flex-shrink-0 shadow-xs">
                <Truck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xs sm:text-sm font-black tracking-wider uppercase text-slate-900 truncate">
                    1. VEHICLE DISPATCH &amp; TRIP SETUP
                  </h2>
                  {visibleDispatches.length > 1 ? (
                    <select
                      id="select-active-dispatch"
                      value={activeDispatch?.id || ""}
                      onChange={(e) => handleSelectDispatch(e.target.value)}
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-900 border border-sky-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-2xs"
                    >
                      {visibleDispatches.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.manifestNumber} • {d.status.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-900 border border-sky-200">
                      Active Trip • {activeDispatch?.manifestNumber || "DSP-VRV-089"}
                    </span>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5 truncate">
                  Configure vehicle registration, scheduled departure, destination branches &amp; total loaded cargo
                </p>
              </div>
            </div>

            {/* Cold-Chain Temp Pill, Vehicle Management Trigger & Trip Status */}
            <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                <Thermometer className="w-3.5 h-3.5 text-emerald-600" />
                <span>-18.4&deg;C Deep Freeze</span>
              </span>

              <button
                type="button"
                id="btn-manage-vehicles"
                data-testid="btn-manage-vehicles"
                onClick={() => handleOpenVehicleModal()}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95 flex-shrink-0"
                title="Manage Fleet Vehicles"
                aria-label="Manage Fleet Vehicles"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>

              <select
                id="select-trip-status"
                value={tripStatus}
                disabled={isTripLocked}
                onChange={(e) => {
                  const val = e.target.value as typeof tripStatus;
                  setTripStatus(val);
                  showToast(`Trip status updated to ${val.toUpperCase()}`, "info");
                }}
                className="px-2.5 py-1 text-xs font-extrabold uppercase rounded-full border border-sky-200 bg-sky-50 text-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="scheduled">Scheduled</option>
                <option value="loading">Loading Bay</option>
                <option value="in-transit">In-Transit</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Prominent Completed/Locked Trip State Banner */}
          {isTripLocked && (
            <div
              id="banner-trip-completed-locked"
              className="mb-4 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center flex-shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs sm:text-sm">Trip Concluded &amp; Locked</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300">
                      Read-Only
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-amber-800 mt-0.5">
                    {activeDispatch?.manifestNumber || "This trip"} has completed all deliveries and is archived. Operational details cannot be edited or resaved.
                  </p>
                </div>
              </div>
              {eligibleDispatch && (
                <button
                  type="button"
                  id="btn-switch-to-active-trip"
                  onClick={() => handleSelectDispatch(eligibleDispatch.id)}
                  className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-amber-900 hover:bg-black text-amber-50 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer flex-shrink-0"
                >
                  <span>Switch to Active ({eligibleDispatch.manifestNumber})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* SECTION 1: 4-COLUMN DELIVERY DISPATCH GRID                       */}
          {/* One column represents one delivery trip with its own dispatch button */}
          {/* ================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            {visibleDispatches.slice(0, 4).map((dsp, index) => {
              const isSelected = dsp.id === selectedDispatchId;
              const isLocked = dsp.status === "completed";
              const isInTransit = dsp.status === "in-transit";
              const depTime =
                dsp.departureTime ||
                (dsp.departedAt ? dsp.departedAt.replace(/^\d{4}-\d{2}-\d{2}[T\s]+/, "") : "Scheduled");
              const branchNames =
                dsp.stops && dsp.stops.length > 0
                  ? dsp.stops.map((s) => s.branchName.replace("Ice Spot ", "")).join(", ")
                  : "No branches assigned";
              const dspCargo = calculateDispatchCargo(dsp, orders);
              const cratesCount = dspCargo.crates;
              const sticksCount = dspCargo.sticks;

              return (
                <div
                  key={dsp.id}
                  id={`delivery-col-${index + 1}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectDispatch(dsp.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleSelectDispatch(dsp.id);
                    }
                  }}
                  className={`rounded-2xl p-4 sm:p-4.5 flex flex-col justify-between gap-3 text-left transition-all cursor-pointer relative ${
                    isSelected
                      ? "bg-gradient-to-b from-sky-50/90 via-sky-50/40 to-white border-2 border-sky-500 shadow-[0_4px_20px_rgba(2,132,199,0.15)] ring-2 ring-sky-500/20"
                      : "bg-white border border-slate-200/90 hover:border-sky-300 hover:shadow-xs"
                  }`}
                >
                  {/* Card Top: Manifest & Status */}
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-2.5">
                      <span className="font-mono text-xs font-black text-slate-900 tracking-wide">
                        {dsp.manifestNumber || `DSP-VRV-${String(index + 89).padStart(3, "0")}`}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border ${
                          isLocked
                            ? "bg-amber-100 text-amber-900 border-amber-300"
                            : isInTransit
                            ? "bg-sky-100 text-sky-800 border-sky-300"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200"
                        }`}
                      >
                        {isLocked && <Lock className="w-2.5 h-2.5" />}
                        {dsp.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Vehicle Number & Model */}
                    <div className="flex items-start gap-2 mb-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        <Truck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-slate-900 truncate">
                          {dsp.vehicleNumber || "KL-08-AX-4412"}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {dsp.notes || "Insulated Reefer Fleet"}
                        </div>
                      </div>
                    </div>

                    {/* Departure Time */}
                    <div className="flex items-center gap-2 text-xs text-slate-700 mb-2 py-1 px-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <Clock className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                      <span className="font-bold text-[11px]">{depTime}</span>
                    </div>

                    {/* Delivering To Branches */}
                    <div className="flex items-start gap-2 text-xs text-slate-600 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Delivering To:
                        </span>
                        <span className="text-[11px] font-semibold text-slate-800 line-clamp-2" title={branchNames}>
                          {branchNames}
                        </span>
                      </div>
                    </div>

                    {/* Loaded Cargo */}
                    <div className="flex items-center gap-2 text-xs text-slate-600 mb-2">
                      <Boxes className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <div className="text-[11px] text-slate-700">
                        <span className="text-slate-500">Loaded: </span>
                        <strong className="font-extrabold text-slate-900">{cratesCount} Crates</strong> ({sticksCount} Sticks)
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Selection Badge & Action Button */}
                  <div className="pt-2.5 border-t border-slate-100 flex flex-col gap-2">
                    {isSelected && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-sky-700 bg-sky-100/70 px-2 py-0.5 rounded text-center">
                        &bull; Active Delivery Selection &bull;
                      </span>
                    )}

                    {isLocked ? (
                      <button
                        type="button"
                        disabled
                        className="w-full py-2 px-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-not-allowed"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Trip Completed (Locked)</span>
                      </button>
                    ) : isInTransit ? (
                      <button
                        type="button"
                        id={isSelected ? "btn-save-and-dispatch" : undefined}
                        data-testid="save-and-dispatch"
                        disabled
                        className="w-full py-2 px-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-xs font-extrabold shadow-2xs flex items-center justify-center gap-1.5 cursor-default opacity-95"
                        title="Trip is actively in-transit. Manage stop deliveries in Section 2 & 3."
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                        <span>✓ Dispatched &amp; En Route</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        id={isSelected ? "btn-save-and-dispatch" : undefined}
                        data-testid="save-and-dispatch"
                        disabled={isDispatchingOrder}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveAndDispatchOrder(dsp.id);
                        }}
                        className="w-full py-2 px-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-extrabold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Truck className="w-3.5 h-3.5 text-emerald-200" />
                        <span>{isDispatchingOrder && isSelected ? "Dispatching..." : "Save and Dispatch Order"}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Trip Notes & Driver Quick Controls */}
          <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="truncate">
                Active: <strong>{activeDispatch?.manifestNumber || "Trip"}</strong> &bull; {activeDispatch?.vehicleNumber || "Vehicle"} &bull; {activeDispatch?.departureTime || "Scheduled"} &bull; <strong className="text-slate-900">{totalCrates} Crates</strong> ({totalCrates * 10} sticks)
              </span>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
              <button
                type="button"
                id="btn-save-dispatch"
                onClick={handleSaveTripDetails}
                disabled={isSavingDispatch || isDispatchingOrder || isTripLocked}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed text-slate-800 font-bold rounded-xl border border-slate-300 shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs active:scale-[0.98]"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isSavingDispatch ? "Saving..." : isTripLocked ? "Trip Completed (Locked)" : "Save Trip Details"}</span>
              </button>

              {isTripLocked ? (
                <button
                  type="button"
                  id="btn-save-and-dispatch-main"
                  data-testid="save-and-dispatch-main"
                  disabled
                  className="px-4 py-1.5 bg-slate-100 border border-slate-200 text-slate-400 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Trip Completed (Locked)</span>
                </button>
              ) : isTripInTransit ? (
                <button
                  type="button"
                  id="btn-save-and-dispatch-main"
                  data-testid="save-and-dispatch-main"
                  disabled
                  className="px-4 py-1.5 bg-sky-100 border border-sky-300 text-sky-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-default opacity-95 shadow-2xs"
                  title="This trip has already departed. Manage stop deliveries in Section 2 & 3."
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                  <span>✓ Dispatched &amp; En Route</span>
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-save-and-dispatch-main"
                  data-testid="save-and-dispatch-main"
                  onClick={() => handleSaveAndDispatchOrder(activeDispatch?.id)}
                  disabled={isSavingDispatch || isDispatchingOrder}
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs whitespace-nowrap active:scale-[0.98]"
                >
                  <Truck className="w-3.5 h-3.5 text-emerald-200" />
                  <span>{isDispatchingOrder ? "Dispatching..." : "Save and Dispatch Order"}</span>
                </button>
              )}
            </div>
          </div>
        </section>
        )}

        {/* ========================================================================= */}
        {/* SECTION 2: SELECTED BRANCHES OPTIONS (Route Sequence & Stop Selector)      */}
        {/* "second section, selected branches options should appear in the second..." */}
        {/* ========================================================================= */}
        {activeSection === "BRANCHES & ROUTE STOP" && (
          <section className="bg-white rounded-2xl sm:rounded-[24px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-4 sm:p-6 transition-all">
          {/* Section 2 Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 sm:pb-5 sm:mb-5 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-[#E22F62] flex items-center justify-center flex-shrink-0 shadow-xs">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xs sm:text-sm font-black tracking-wider uppercase text-slate-900 truncate">
                    2. SELECTED BRANCHES &amp; ROUTE STOPS
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-[#BD1F49] border border-rose-200">
                    {selectedBranchIds.length} Stops Assigned
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5 truncate">
                  Tap any branch stop below to view all its order products in Section 3 and confirm handover
                </p>
              </div>
            </div>

            <div className="text-[11px] font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60 self-start sm:self-auto">
              Selected Branch: <strong className="text-slate-900">{activeBranch.name}</strong>
            </div>
          </div>

          {/* Responsive Grid of Selected Branch Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            {selectedBranchIds.length === 0 ? (
              <div className="col-span-full text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">No route stops assigned</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Click the plus (+) button above to set up a delivery trip with destination branches.
                </p>
              </div>
            ) : (
              selectedBranchIds.map((branchId, idx) => {
                const branch = getBranchDetails(branchId);
                const isSelectedForView = activeBranchId === branchId;
                const status = branchStopStatus[branchId] || "scheduled";
                const isDelivered = status === "delivered";
                const isInTransit = status === "in-transit";
                const matchedStop = activeDispatch?.stops?.find((s) => isBranchMatch(branchId, s.branchId, s.branchName));
                const targetStop: DispatchStop = matchedStop || {
                  id: `stop-${branchId}`,
                  orderId: "",
                  orderNumber: "",
                  branchId,
                  branchName: branch.name,
                  district: branch.district,
                  address: branch.location,
                  phone: branch.phone || "+91 94470 00000",
                  sequence: idx + 1,
                  items: [],
                  status: (branchStopStatus[branchId] || "scheduled") as StopDeliveryStatus,
                };
                const stopCargo = calculateStopCargo(targetStop, activeDispatch, orders);
                const stopCrates = stopCargo.crates;
                const stopSticks = stopCargo.sticks;

                return (
                  <div
                    key={branchId}
                    onClick={() => setActiveBranchId(branchId)}
                    className={`relative rounded-2xl p-4 sm:p-5 transition-all cursor-pointer flex flex-col justify-between gap-3 text-left ${
                      isSelectedForView
                        ? "bg-rose-50/60 border-2 border-[#D83162] shadow-[0_4px_16px_rgba(216,49,98,0.12)] ring-2 ring-[#D83162]/20"
                        : "bg-white border border-slate-200 hover:border-rose-300 hover:bg-slate-50/50 shadow-xs"
                    }`}
                  >
                  {/* Active Selection Indicator Pill */}
                  {isSelectedForView && (
                    <div className="absolute -top-2.5 right-4 bg-[#D83162] text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>Active Stop Selected</span>
                    </div>
                  )}

                  <div>
                    {/* Top Row: Sequence Badge + Branch Name + Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-full font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            isSelectedForView ? "bg-[#D83162] text-white" : "bg-slate-900 text-white"
                          }`}
                        >
                          {idx + 1}
                        </span>

                        <div className="min-w-0">
                          <h3 className="text-xs sm:text-sm font-black text-slate-900 leading-tight truncate">
                            {branch.name}
                          </h3>
                          <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                            {branch.district} &bull; {branch.location.split(",")[0]}
                          </p>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="flex-shrink-0">
                        {isDelivered ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Delivered</span>
                          </span>
                        ) : isInTransit ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                            <span>En Route</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            <span>Scheduled</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Cargo Info */}
                    <div className="mt-3 flex items-center justify-between text-[11px] bg-white/80 p-2 rounded-xl border border-slate-100">
                      <span className="text-slate-500">Allocated Cargo:</span>
                      <strong className="text-slate-900 font-extrabold">
                        {stopCrates} Crates ({stopSticks} sticks)
                      </strong>
                    </div>
                  </div>

                  {/* Card Bottom: Select to View Products button + Mark Delivered Action */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveBranchId(branchId);
                        setActiveSection("ORDERED STOCK");
                      }}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                        isSelectedForView
                          ? "text-[#BD1F49] font-black bg-rose-100/70"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      <span>{isSelectedForView ? "● Showing Products" : "View Products →"}</span>
                    </button>

                    {!isDelivered ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkStopDelivered(branchId, branch.name);
                        }}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Deliver</span>
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>Done</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            }))}
          </div>
        </section>
        )}

        {/* ========================================================================= */}
        {/* SECTION 3: SPECIFIC BRANCH ORDER PRODUCTS                                 */}
        {/* "Third section, when select a specific branch in the second section,      */}
        {/*  third section should show all the order products of that sepcific branch"*/}
        {/* ========================================================================= */}
        {activeSection === "ORDERED STOCK" && (
          <section className="bg-white rounded-2xl sm:rounded-[24px] border border-rose-100/90 shadow-[0_4px_24px_rgba(216,49,98,0.04)] p-4 sm:p-6 transition-all">
          {/* Section 3 Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 sm:pb-5 sm:mb-5 border-b border-slate-100 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 shadow-xs">
                <Package className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xs sm:text-sm font-black tracking-wider uppercase text-slate-900 truncate">
                    3. ORDER PRODUCTS &bull; {activeBranch.name.toUpperCase()}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
                    Stop #{selectedBranchIds.indexOf(activeBranchId) + 1}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5 truncate">
                  Complete product manifest, crate counts, and cold-chain temperature verification for {activeBranch.name}
                </p>
              </div>
            </div>

            {/* Branch Quick Contact */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <a
                href={`tel:${activeBranch.phone || "+919447000000"}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                <Phone className="w-3.5 h-3.5 text-sky-600" />
                <span>Call Branch: {activeBranch.phone || "+91 94470 00004"}</span>
              </a>
            </div>
          </div>

          {/* Branch Stop Selector Pills if multiple stops in trip */}
          {selectedBranchIds.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3">
              <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Switch Stop:</span>
              {selectedBranchIds.map((bId, idx) => {
                const bDetails = getBranchDetails(bId);
                const isCurrent = activeBranchId === bId;
                return (
                  <button
                    key={bId}
                    type="button"
                    onClick={() => setActiveBranchId(bId)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      isCurrent
                        ? "bg-[#BD1F49] text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {idx + 1}. {bDetails.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Location & Manifest Summary Banner */}
          <div className="mb-4 p-3 sm:p-3.5 bg-gradient-to-r from-slate-50 to-rose-50/40 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="w-4 h-4 text-[#D83162] flex-shrink-0" />
              <span className="font-semibold text-slate-700 truncate">
                Delivery Address: <strong className="text-slate-900">{activeBranch.location}</strong>
              </span>
            </div>

            <div className="flex items-center gap-3 text-slate-500 font-medium flex-shrink-0">
              <span>
                {(() => {
                  const matchedStop = activeDispatch?.stops?.find((s) => isBranchMatch(activeBranchId, s.branchId, s.branchName));
                  return matchedStop?.orderNumber || "Order";
                })()}
              </span>
              <span>&bull;</span>
              <span className="font-bold text-slate-900">
                {activeBranchOrderProducts.reduce((sum, item) => sum + getItemCrates(item), 0)} Total Crates ({activeBranchOrderProducts.reduce((sum, item) => sum + getItemSticks(item), 0)} sticks)
              </span>
            </div>
          </div>

          {/* Return-Only Quantity Table */}
          <div className="space-y-3">
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-1">
              Delivery Manifest — Return-Only Entry ({activeBranchOrderProducts.length} Items)
            </div>

            {activeBranchOrderProducts.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">No approved requisition products available</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                  {getBranchAndEligibleOrder(activeBranchId).ineligibleReason ||
                    `No approved orders or dispatch items found for ${activeBranch.name}. Requisitions must be approved by Super Admin before products can be manifested for delivery.`}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left py-2.5 px-3 font-black text-slate-600 uppercase tracking-wider text-[10px]">Product</th>
                      <th className="text-center py-2.5 px-3 font-black text-slate-600 uppercase tracking-wider text-[10px] whitespace-nowrap">Assigned Qty</th>
                      <th className="text-center py-2.5 px-3 font-black text-slate-600 uppercase tracking-wider text-[10px] whitespace-nowrap">Returned Qty (sticks)</th>
                      <th className="text-center py-2.5 px-3 font-black text-slate-600 uppercase tracking-wider text-[10px] whitespace-nowrap">Delivered Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBranchOrderProducts.map((item, pIdx) => {
                      const key = `${activeBranchId}-${item.productId || pIdx}`;
                      const unitsPerPack = item.requestedUnits && item.requestedPacks
                        ? Math.round(item.requestedUnits / item.requestedPacks)
                        : STICKS_PER_CRATE;
                      const assignedCrates = item.approvedPacks || item.requestedPacks || 0;
                      const assignedSticks = item.approvedUnits || item.packedUnits || (assignedCrates * unitsPerPack);
                      const rawReturned = returnedQuantities[key];
                      const returnedSticks = (rawReturned === "" || rawReturned === undefined) ? 0 : Number(rawReturned);
                      const deliveredSticks = isNaN(returnedSticks) ? assignedSticks : Math.max(0, assignedSticks - returnedSticks);
                      const validationError = returnQuantityValidation.errors[key];
                      const isStopDelivered = branchStopStatus[activeBranchId] === "delivered";

                      return (
                        <tr
                          key={key}
                          className={`border-b border-slate-100 transition-colors ${
                            validationError ? "bg-red-50/50" : "hover:bg-slate-50/50"
                          }`}
                        >
                          {/* Product Column */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                                {item.productName}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 flex-shrink-0">
                                {item.sku || `SKU-STK-${pIdx + 1}`}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-400">
                              {item.packType || "Crate"} &bull; {unitsPerPack} sticks/crate
                            </div>
                          </td>

                          {/* Assigned Quantity Column */}
                          <td className="py-3 px-3 text-center">
                            <span className="inline-block font-extrabold text-[#BD1F49] bg-rose-50 px-2 py-1 rounded border border-rose-100 text-xs">
                              {assignedCrates} <span className="font-medium text-[10px]">crates</span>
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {assignedSticks} sticks
                            </div>
                          </td>

                          {/* Returned Quantity Column — Editable Input in Sticks */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex flex-col items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max={assignedSticks}
                                step="1"
                                disabled={isStopDelivered || isSubmittingDelivery}
                                value={rawReturned === undefined ? 0 : rawReturned}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setReturnedQuantities((prev) => ({
                                    ...prev,
                                    [key]: val === "" ? "" : Number(val)
                                  }));
                                }}
                                onBlur={(e) => {
                                  // On blur, if empty set to 0
                                  if (e.target.value === "") {
                                    setReturnedQuantities((prev) => ({
                                      ...prev,
                                      [key]: 0
                                    }));
                                  }
                                }}
                                className={`w-16 sm:w-20 text-center px-2 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                                  isStopDelivered
                                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                    : validationError
                                    ? "border-red-400 bg-red-50 text-red-700 focus:ring-2 focus:ring-red-300 focus:outline-none"
                                    : "border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-[#D83162]/30 focus:border-[#D83162] focus:outline-none"
                                }`}
                                aria-label={`Returned quantity (sticks) for ${item.productName}`}
                                data-testid={`returned-qty-${item.productId || pIdx}`}
                              />
                              {!validationError && returnedSticks > 0 && (
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {formatCrateEquiv(returnedSticks, unitsPerPack)} crates
                                </span>
                              )}
                              {validationError && (
                                <span className="text-[9px] text-red-600 font-bold max-w-[120px] leading-tight">
                                  {validationError}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Delivered Quantity Column — Auto-Calculated in Sticks */}
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block font-extrabold px-2 py-1 rounded text-xs ${
                              validationError
                                ? "bg-red-50 text-red-600 border border-red-200"
                                : deliveredSticks === assignedSticks
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : deliveredSticks === 0
                                ? "bg-amber-50 text-amber-800 border border-amber-200"
                                : "bg-sky-50 text-sky-800 border border-sky-200"
                            }`}>
                              {validationError ? "—" : deliveredSticks} <span className="font-medium text-[10px]">sticks</span>
                            </span>
                            {!validationError && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {formatCrateEquiv(deliveredSticks, unitsPerPack)} crates
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Summary Footer */}
                  <tfoot>
                    <tr className="bg-slate-50/80 border-t-2 border-slate-200">
                      <td className="py-2.5 px-3 font-black text-slate-700 text-[11px] uppercase">
                        Reconciled Totals ({activeBranchOrderProducts.length} Items)
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-extrabold text-[#BD1F49] text-xs">
                          {activeBranchOrderProducts.reduce((sum, item) => sum + getItemCrates(item), 0)} crates
                        </span>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {activeBranchOrderProducts.reduce((sum, item) => {
                            const u = item.requestedUnits && item.requestedPacks ? Math.round(item.requestedUnits / item.requestedPacks) : 10;
                            return sum + getItemSticks(item, u);
                          }, 0)} sticks
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-extrabold text-amber-700 text-xs">
                          {(() => {
                            let totalSticks = 0;
                            activeBranchOrderProducts.forEach((item, idx) => {
                              const key = `${activeBranchId}-${item.productId || idx}`;
                              const raw = returnedQuantities[key];
                              const val = (raw === "" || raw === undefined) ? 0 : Number(raw);
                              if (!isNaN(val) && val >= 0) totalSticks += val;
                            });
                            return `${totalSticks} sticks`;
                          })()}
                        </span>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {(() => {
                            let totalSticks = 0;
                            activeBranchOrderProducts.forEach((item, idx) => {
                              const key = `${activeBranchId}-${item.productId || idx}`;
                              const raw = returnedQuantities[key];
                              const val = (raw === "" || raw === undefined) ? 0 : Number(raw);
                              if (!isNaN(val) && val >= 0) totalSticks += val;
                            });
                            return `${formatCrateEquiv(totalSticks, 10)} crates`;
                          })()}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-extrabold text-emerald-700 text-xs">
                          {(() => {
                            let totalDeliveredSticks = 0;
                            activeBranchOrderProducts.forEach((item, idx) => {
                              const key = `${activeBranchId}-${item.productId || idx}`;
                              const u = item.requestedUnits && item.requestedPacks ? Math.round(item.requestedUnits / item.requestedPacks) : 10;
                              const assigned = getItemSticks(item, u);
                              const raw = returnedQuantities[key];
                              const ret = (raw === "" || raw === undefined) ? 0 : Number(raw);
                              if (!isNaN(ret) && ret >= 0) {
                                totalDeliveredSticks += Math.max(0, assigned - ret);
                              } else {
                                totalDeliveredSticks += assigned;
                              }
                            });
                            return `${totalDeliveredSticks} sticks`;
                          })()}
                        </span>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {(() => {
                            let totalDeliveredSticks = 0;
                            activeBranchOrderProducts.forEach((item, idx) => {
                              const key = `${activeBranchId}-${item.productId || idx}`;
                              const u = item.requestedUnits && item.requestedPacks ? Math.round(item.requestedUnits / item.requestedPacks) : 10;
                              const assigned = getItemSticks(item, u);
                              const raw = returnedQuantities[key];
                              const ret = (raw === "" || raw === undefined) ? 0 : Number(raw);
                              if (!isNaN(ret) && ret >= 0) {
                                totalDeliveredSticks += Math.max(0, assigned - ret);
                              } else {
                                totalDeliveredSticks += assigned;
                              }
                            });
                            return `${formatCrateEquiv(totalDeliveredSticks, 10)} crates`;
                          })()}
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Delivery Submit Error */}
          {deliverySubmitError && (
            <div className="mt-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span>{deliverySubmitError}</span>
            </div>
          )}

          {/* Section 3 Handover Actions Bar */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-500 font-medium">
              Ready for physical unload &amp; handover at <strong>{activeBranch.name}</strong>
            </div>

            <div className="flex items-center gap-2.5">
              {branchStopStatus[activeBranchId] === "delivered" ? (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Handover Completed &amp; Signed for {activeBranch.name}</span>
                </div>
              ) : (
                <button
                  type="button"
                  id="btn-mark-branch-delivered"
                  data-testid="mark-branch-delivered"
                  disabled={isSubmittingDelivery || returnQuantityValidation.hasAnyError}
                  onClick={() => handleMarkStopDelivered(activeBranchId, activeBranch.name)}
                  className={`w-full sm:w-auto px-5 py-2.5 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${
                    isSubmittingDelivery || returnQuantityValidation.hasAnyError
                      ? "bg-slate-400 cursor-not-allowed opacity-70"
                      : "bg-gradient-to-r from-[#D83162] to-[#BD1F49] hover:from-[#BD1F49] hover:to-[#6D0C27] cursor-pointer"
                  }`}
                >
                  {isSubmittingDelivery ? (
                    <>
                      <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Confirming Delivery...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                      <span>Confirm Delivery &amp; Handover</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </section>
        )}

        {/* ========================================================================= */}
        {/* SECTION 4: INCOMING PARLOUR ORDERS & REPLENISHMENT PROCESSING             */}
        {/* ========================================================================= */}
        {activeSection === "INCOMING BRANCH ORDERS" && (
          <section
            id="section-incoming-orders"
            className="bg-white rounded-2xl sm:rounded-[22px] border border-sky-100 shadow-[0_4px_24px_rgba(14,165,233,0.04)] p-4 sm:p-7 space-y-6"
          >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 text-sky-700 flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black tracking-wider uppercase text-slate-900">
                  SECTION 4: INCOMING PARLOUR ORDERS &amp; DISPATCH QUEUE
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Real-time branch order replenishment queue awaiting cold-storage loading and dispatch
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => syncOrdersFromServer()}
                className="px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1"
                title="Refresh order queue from server"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter("all")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  orderFilter === "all"
                    ? "bg-[#0F172A] text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Orders ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter("submitted")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  orderFilter === "submitted"
                    ? "bg-amber-500 text-white shadow-xs"
                    : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                }`}
              >
                Awaiting Review ({orders.filter((o) => o.status === "submitted" || o.status === "under-review").length})
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter("approved")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  orderFilter === "approved"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                }`}
              >
                Approved &amp; Awaiting Dispatch ({orders.filter((o) => (o.status === "approved" || o.status === "preparation" || o.status === "ready-for-dispatch") && !o.assignedDispatchId).length})
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter("dispatched")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  orderFilter === "dispatched"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200"
                }`}
              >
                In Transit ({orders.filter((o) => o.status === "dispatched" || (o.status !== "delivered" && o.status !== "cancelled" && !!o.assignedDispatchId)).length})
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter("delivered")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  orderFilter === "delivered"
                    ? "bg-slate-700 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Delivered ({orders.filter((o) => o.status === "delivered").length})
              </button>
            </div>
          </div>

          {/* Incoming Orders Cards */}
          {(() => {
            const isOrderAwaitingReview = (o: AdminOrder) => o.status === "submitted" || o.status === "under-review";
            const isOrderApprovedAwaitingDispatch = (o: AdminOrder) =>
              (o.status === "approved" || o.status === "preparation" || o.status === "ready-for-dispatch") && !o.assignedDispatchId;
            const isOrderInTransit = (o: AdminOrder) =>
              o.status === "dispatched" || (o.status !== "delivered" && o.status !== "cancelled" && !!o.assignedDispatchId);
            const isOrderDelivered = (o: AdminOrder) => o.status === "delivered";

            const filtered = orders.filter((o) => {
              if (orderFilter === "all") return true;
              if (orderFilter === "submitted") return isOrderAwaitingReview(o);
              if (orderFilter === "approved") return isOrderApprovedAwaitingDispatch(o);
              if (orderFilter === "dispatched") return isOrderInTransit(o);
              if (orderFilter === "delivered") return isOrderDelivered(o);
              return o.status === orderFilter;
            });

            if (filtered.length === 0) {
              return (
                <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">No incoming orders found</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    No parlour orders match the selected filter ({orderFilter}).
                  </p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((ord) => {
                  const totalCrates = ord.items.reduce((acc, it) => acc + getItemCrates(it), 0);
                  const totalSticks = ord.items.reduce((acc, it) => acc + getItemSticks(it), 0);
                  const isPending = isOrderAwaitingReview(ord);
                  const isApproved = isOrderApprovedAwaitingDispatch(ord);
                  const isDispatched = isOrderInTransit(ord);
                  const isDelivered = isOrderDelivered(ord);

                  return (
                    <div
                      key={ord.id}
                      className="border border-slate-200/90 hover:border-sky-300 rounded-2xl p-4 sm:p-5 bg-white transition-all hover:shadow-xs flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="text-sm font-bold text-slate-900 leading-snug">
                                {ord.branchName}
                              </h3>
                              {ord.branchCode && (
                                <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                  {ord.branchCode}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 font-medium mt-1">
                              Order #{ord.orderNumber} &bull; {totalCrates} Crates ({totalSticks} sticks)
                            </p>
                            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                              🏭 Destination: <span className="font-semibold text-slate-700">{ord.destinationFactory || "Varavoor Factory"}</span>
                            </p>
                          </div>

                          {/* Status Pill */}
                          <div className="flex-shrink-0">
                            {isPending && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                <span>AWAITING APPROVAL</span>
                              </span>
                            )}
                            {isApproved && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                <span>APPROVED &amp; READY</span>
                              </span>
                            )}
                            {isDispatched && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                                <span>IN TRANSIT</span>
                              </span>
                            )}
                            {isDelivered && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                <span>DELIVERED</span>
                              </span>
                            )}
                            {ord.status === "cancelled" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                <span>CANCELLED</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 space-y-1 text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
                          <p>
                            Delivery: <strong className="text-slate-800">{ord.requestedDeliveryDate}</strong>
                            {ord.submittedAt && (
                              <span className="text-slate-400 ml-2">&bull; Submitted: {ord.submittedAt}</span>
                            )}
                          </p>
                          {ord.branchNotes && (
                            <div className="text-amber-900 bg-amber-50/80 border border-amber-200/80 px-2.5 py-1.5 rounded-lg font-medium mt-1">
                              <span className="font-bold">Instructions:</span> {ord.branchNotes}
                            </div>
                          )}
                        </div>

                        {/* Product Breakdown Chips */}
                        <div className="mt-2.5 flex flex-wrap gap-1">
                          {ord.items.slice(0, 3).map((it, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-medium bg-slate-50 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md"
                            >
                              {it.productName}: {getItemCrates(it)} cr
                            </span>
                          ))}
                          {ord.items.length > 3 && (
                            <span className="text-[10px] font-bold text-slate-400 px-1 py-0.5">
                              +{ord.items.length - 3} more flavours
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Action Button */}
                      <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        {isApproved && (
                          <button
                            type="button"
                            onClick={() => handleOpenVehicleModal(ord.branchId)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer w-full justify-center"
                          >
                            <Truck className="w-3.5 h-3.5 text-sky-400" />
                            <span>Schedule Delivery Trip</span>
                          </button>
                        )}
                        {isDispatched && (
                          <button
                            type="button"
                            onClick={() => {
                              if (ord.assignedDispatchId) {
                                handleSelectDispatch(ord.assignedDispatchId);
                              } else {
                                const matchingDispatch = dispatches.find((d) =>
                                  d.stops?.some((s) => s.orderId === ord.id || isBranchMatch(s.branchId, ord.branchId, ord.branchName))
                                );
                                if (matchingDispatch) {
                                  handleSelectDispatch(matchingDispatch.id);
                                }
                              }
                              setActiveSection("BRANCHES & ROUTE STOP");
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer w-full justify-center"
                          >
                            <ArrowRight className="w-3.5 h-3.5 text-white" />
                            <span>View in Active Trip</span>
                          </button>
                        )}
                        {isDelivered && (
                          <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-500 w-full py-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Trip Completed &amp; Reconciled</span>
                          </div>
                        )}
                        {isPending && (
                          <div className="text-[11px] text-amber-700 font-medium italic text-center w-full py-1">
                            Awaiting Super Admin Approval
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
        )}
      </div>

      {/* ========================================================================= */}
      {/* VEHICLE MANAGEMENT MODAL / POPOVER                                       */}
      {/* ========================================================================= */}
      {isVehicleModalOpen && (
        <div
          id="modal-vehicle-management"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-vehicle-title"
        >
          <div
            className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100 border border-sky-200 text-sky-700 flex items-center justify-center flex-shrink-0">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 id="modal-vehicle-title" className="text-sm sm:text-base font-black text-slate-900">
                      Set Up Delivery Trip
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-100 text-sky-800 border border-sky-200">
                      {fleetVehicles.length} Vehicles
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Configure vehicle number, time, delivering branches, and crate capacity
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="btn-close-vehicle-modal"
                onClick={() => {
                  handleCancelEditVehicle();
                  setIsVehicleModalOpen(false);
                }}
                className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                aria-label="Close delivery modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
              {/* Top Form: Fill out vehicle number, time, delivering to branches, and crates capacity */}
              <form onSubmit={handleSetDelivery} className="bg-sky-50/60 border border-sky-100 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-sky-100/90 pb-2.5">
                  <span className="text-xs font-black uppercase tracking-wider text-sky-900 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                    <span>Set Delivery Trip Form</span>
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    Step 1: Fill details &bull; Click "Set Delivery"
                  </span>
                </div>

                {/* Validation Feedback Alert */}
                {vehFormError && (
                  <div id="veh-form-error" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span>{vehFormError}</span>
                  </div>
                )}

                {/* 1. Vehicle Number & Model */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                      Vehicle Registration Number *
                    </label>
                    <input
                      type="text"
                      id="input-new-delivery-vehicle"
                      value={newDeliveryVehicle}
                      onChange={(e) => {
                        setNewDeliveryVehicle(e.target.value);
                        setVehRegInput(e.target.value);
                        if (vehFormError) setVehFormError(null);
                      }}
                      placeholder="e.g. KL-08-AX-4412"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 uppercase placeholder:normal-case shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                      Vehicle Model / Type
                    </label>
                    <input
                      type="text"
                      id="input-new-delivery-model"
                      value={newDeliveryModel}
                      onChange={(e) => {
                        setNewDeliveryModel(e.target.value);
                        setVehTypeInput(e.target.value);
                      }}
                      placeholder="e.g. Insulated Reefer Van"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs"
                    />
                  </div>
                </div>

                {/* 2. Departure Time & Crates Capacity */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                      Scheduled Departure Time *
                    </label>
                    <input
                      type="text"
                      id="input-new-delivery-time"
                      value={newDeliveryTime}
                      onChange={(e) => setNewDeliveryTime(e.target.value)}
                      placeholder="e.g. 12:45 PM"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                      Vehicle Carrying Capacity
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setNewDeliveryCrates((c) => Math.max(1, c - 1))}
                        className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-700 flex items-center justify-center font-bold shadow-2xs hover:bg-slate-50 cursor-pointer"
                        title="Deduct 1 crate"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        id="input-new-delivery-crates"
                        value={newDeliveryCrates}
                        onChange={(e) => setNewDeliveryCrates(parseInt(e.target.value) || 24)}
                        className="flex-1 min-w-0 px-2 py-2 bg-white border border-slate-200 rounded-xl text-center text-xs sm:text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={() => setNewDeliveryCrates((c) => c + 1)}
                        className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-700 flex items-center justify-center font-bold shadow-2xs hover:bg-slate-50 cursor-pointer"
                        title="Add 1 crate"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[11px] text-slate-500 font-bold ml-1 whitespace-nowrap">
                        = {newDeliveryCrates * 10} Sticks
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Delivering To Branches Multi-Select */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                      Delivering To Branches * ({newDeliveryBranches.length} Selected)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setNewDeliveryBranches(eligibleBranches.map((eb) => eb.branch.id))}
                        className="text-[10px] font-bold text-sky-700 hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">&bull;</span>
                      <button
                        type="button"
                        onClick={() => setNewDeliveryBranches([])}
                        className="text-[10px] font-bold text-slate-500 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {eligibleBranches.length === 0 ? (
                    <div className="p-3 text-center text-xs text-amber-900 bg-amber-50 rounded-xl border border-amber-200">
                      <p className="font-bold">No approved branch requisitions available for dispatch</p>
                      <p className="text-[10px] text-amber-800 mt-0.5">
                        Super Admin must approve branch requisitions before they can be scheduled for delivery.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1.5 border border-slate-200/80 bg-white rounded-xl">
                      {eligibleBranches.map((eb) => {
                        const isChecked = newDeliveryBranches.includes(eb.branch.id);
                        return (
                          <button
                            key={eb.branch.id}
                            type="button"
                            onClick={() => {
                              setNewDeliveryBranches((prev) =>
                                prev.includes(eb.branch.id)
                                  ? prev.filter((id) => id !== eb.branch.id)
                                  : [...prev, eb.branch.id]
                              );
                              if (vehFormError) setVehFormError(null);
                            }}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-semibold transition-all cursor-pointer ${
                              isChecked
                                ? "bg-sky-50 text-sky-900 border border-sky-300 shadow-2xs"
                                : "hover:bg-slate-50 text-slate-700 border border-slate-100"
                            }`}
                          >
                            <div className="min-w-0 mr-2">
                              <span className="font-bold text-slate-900 truncate block">{eb.branch.name}</span>
                              <span className="text-[10px] text-sky-700 font-medium block">
                                Order #{eb.order.orderNumber} &bull; {eb.totalCrates} crates ({eb.totalSticks} sticks)
                              </span>
                            </div>
                            <span
                              className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                                isChecked
                                  ? "bg-sky-600 border-sky-600 text-white"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Primary Action Button: "Set Delivery" */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    id="btn-set-delivery"
                    data-testid="set-delivery"
                    disabled={isSubmittingDispatchModal}
                    className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSubmittingDispatchModal ? "Scheduling..." : "Set Delivery"}</span>
                  </button>
                </div>
              </form>

              {/* Below this selecting option: Earlier typed vehicle number and model details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Earlier Typed Vehicles &amp; Fleet Registry ({fleetVehicles.length})
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Click "Use Vehicle" to pre-fill form
                  </span>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {fleetVehicles.map((veh) => {
                    const isFormActive =
                      newDeliveryVehicle.trim().toUpperCase() === veh.registrationNumber.trim().toUpperCase();

                    return (
                      <div
                        key={veh.id}
                        className={`p-3 rounded-xl border transition-all flex flex-col xs:flex-row xs:items-center justify-between gap-2.5 ${
                          isFormActive
                            ? "bg-sky-50/80 border-sky-300 shadow-2xs"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-slate-900 tracking-wide font-mono">
                              {veh.registrationNumber}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 truncate">
                              {veh.modelOrType}
                            </span>
                            {isFormActive && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-sky-200 text-sky-900 border border-sky-300">
                                Populated in Form
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Capacity: <strong>{veh.capacityCrates} crates</strong> ({veh.capacityCrates * 10} sticks)
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end xs:self-auto flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSelectEarlierVehicle(veh)}
                            className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                              isFormActive
                                ? "bg-sky-700 text-white"
                                : "bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300"
                            }`}
                            title="Auto-fill form above with this vehicle"
                          >
                            {isFormActive ? "Loaded" : "Use Vehicle"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEditVehicle(veh)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer shadow-2xs"
                            title="Edit vehicle details"
                            aria-label={`Edit vehicle ${veh.registrationNumber}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteFleetVehicle(veh.id)}
                            disabled={fleetVehicles.length <= 1}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-2xs"
                            title={fleetVehicles.length <= 1 ? "At least 1 vehicle required" : "Delete vehicle from registry"}
                            aria-label={`Delete vehicle ${veh.registrationNumber}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Inline Fleet Registry Add / Edit Form for test compatibility */}
                <form onSubmit={handleSaveVehicleSubmit} className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-slate-400 w-full sm:w-auto">
                    {editingVehicleId ? "Edit Registry Vehicle:" : "Add New to Fleet:"}
                  </span>
                  <input
                    type="text"
                    id="input-veh-reg"
                    value={vehRegInput}
                    onChange={(e) => {
                      setVehRegInput(e.target.value);
                      if (vehFormError) setVehFormError(null);
                    }}
                    placeholder="Reg No. (e.g. KL-08-AX-9999)"
                    className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg uppercase placeholder:normal-case font-bold"
                  />
                  <input
                    type="text"
                    id="input-veh-type"
                    value={vehTypeInput}
                    onChange={(e) => setVehTypeInput(e.target.value)}
                    placeholder="Model (e.g. Reefer Van)"
                    className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium"
                  />
                  <input
                    type="number"
                    min="1"
                    id="input-veh-capacity"
                    value={vehCapacityInput}
                    onChange={(e) => setVehCapacityInput(parseInt(e.target.value) || 24)}
                    className="w-16 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-center font-bold"
                  />
                  {editingVehicleId && (
                    <button
                      type="button"
                      onClick={handleCancelEditVehicle}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    id="btn-submit-vehicle"
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-2xs"
                  >
                    {editingVehicleId ? "Update Registry" : "+ Save to Registry"}
                  </button>
                </form>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Delivery trips and fleet records persist in your local admin state.
              </span>
              <button
                type="button"
                onClick={() => {
                  handleCancelEditVehicle();
                  setIsVehicleModalOpen(false);
                }}
                className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-all cursor-pointer shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
