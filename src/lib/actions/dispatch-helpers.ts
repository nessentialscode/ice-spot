import { OrderItem, DispatchStop, DispatchBatch, AdminOrder } from "@/types/admin";

export interface CargoCalculationResult {
  crates: number;
  sticks: number;
  items: OrderItem[];
  hasItems: boolean;
}

export interface DispatchCargoResult {
  crates: number;
  sticks: number;
  stopsCargo: Record<string, CargoCalculationResult>;
}

/**
 * Standard packaging conversion: 1 Crate = 10 Sticks
 */
export const STICKS_PER_CRATE = 10;

/**
 * Formats a stick quantity into its crate equivalent string.
 * Handles whole and partial crates cleanly (e.g. 50 -> "5", 45 -> "4.5", 3 -> "0.3").
 */
export function formatCrateEquiv(sticks: number, unitsPerCrate = STICKS_PER_CRATE): string {
  if (sticks === 0) return "0";
  const crates = sticks / unitsPerCrate;
  if (Number.isInteger(crates)) return `${crates}`;
  return Number(crates.toFixed(2)).toString();
}

/**
 * Normalizes branch name/identifier for resilient matching
 */
export function isBranchMatch(
  branchIdentifier?: string,
  orderBranchId?: string,
  orderBranchName?: string,
  orderBranchCode?: string
): boolean {
  if (!branchIdentifier) return false;
  const bLower = branchIdentifier.toLowerCase().trim();
  const idLower = (orderBranchId || "").toLowerCase().trim();
  const nameLower = (orderBranchName || "").toLowerCase().trim();
  const codeLower = (orderBranchCode || "").toLowerCase().trim();

  if (bLower && idLower && bLower === idLower) return true;
  if (codeLower && (bLower.includes(codeLower) || codeLower.includes(bLower))) return true;

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

  return false;
}

/**
 * Gets the authoritative crate count for an item.
 * Preserves zero-quantity approvals when explicitly reviewed and approved by Super Admin.
 */
export function getItemCrates(it: OrderItem): number {
  if (it.approvedPacks !== undefined && it.approvedPacks !== null) {
    return Number(it.approvedPacks) || 0;
  }
  return Number(it.requestedPacks) || 0;
}

/**
 * Gets the authoritative stick count for an item.
 * Preserves zero-quantity approvals when explicitly reviewed and approved by Super Admin.
 */
export function getItemSticks(it: OrderItem, unitsPerCrate = STICKS_PER_CRATE): number {
  if (it.approvedUnits !== undefined && it.approvedUnits !== null) {
    return Number(it.approvedUnits) || 0;
  }
  if (it.packedUnits !== undefined && it.packedUnits !== null) {
    return Number(it.packedUnits) || 0;
  }
  return getItemCrates(it) * unitsPerCrate;
}

/**
 * Calculates cargo quantities (crates and sticks) from an authoritative list of OrderItems.
 * Applies the canonical packaging conversion: 1 Crate = 10 Sticks.
 */
export function calculateItemsCargo(items?: OrderItem[]): CargoCalculationResult {
  if (!items || items.length === 0) {
    return { crates: 0, sticks: 0, items: [], hasItems: false };
  }

  const crates = items.reduce((sum, it) => sum + getItemCrates(it), 0);
  const sticks = items.reduce((sum, it) => sum + getItemSticks(it), 0);

  return {
    crates,
    sticks: sticks > 0 ? sticks : crates * STICKS_PER_CRATE,
    items,
    hasItems: true,
  };
}

/**
 * Resolves the authoritative OrderItem array for a route stop.
 * Prioritizes:
 * 1. Stop's own embedded items if populated.
 * 2. Associated order in ordersList by orderId.
 * 3. Linked order in ordersList by branchId matching.
 * 4. Single-stop dispatch fallback from dispatch_items.
 */
export function resolveStopItems(
  stop: DispatchStop,
  dispatch?: DispatchBatch | null,
  ordersList: AdminOrder[] = []
): OrderItem[] {
  // 1. Priority: Stop's own embedded items
  if (stop.items && stop.items.length > 0) {
    return stop.items;
  }

  // 2. Lookup by stop.orderId in ordersList
  if (stop.orderId && ordersList.length > 0) {
    const matchedOrder = ordersList.find(
      (o) => o.id === stop.orderId || o.orderNumber === stop.orderId
    );
    if (matchedOrder && matchedOrder.items && matchedOrder.items.length > 0) {
      return matchedOrder.items;
    }
  }

  // 3. Lookup by stop.branchId in ordersList
  if (stop.branchId && ordersList.length > 0) {
    const matchingOrders = ordersList.filter((o) =>
      isBranchMatch(stop.branchId, o.branchId, o.branchName, o.branchCode)
    );

    // Look for order specifically assigned to this dispatch
    if (dispatch?.id) {
      const assigned = matchingOrders.find((o) => o.assignedDispatchId === dispatch.id);
      if (assigned && assigned.items && assigned.items.length > 0) {
        return assigned.items;
      }
    }

    // Look for approved or in-transit order for this branch
    const activeOrder = matchingOrders.find(
      (o) =>
        ["approved", "dispatched", "ready-for-dispatch", "preparation"].includes(o.status) &&
        o.items &&
        o.items.length > 0
    );
    if (activeOrder && activeOrder.items && activeOrder.items.length > 0) {
      return activeOrder.items;
    }
  }

  // 4. Single-stop dispatch fallback from raw dispatch items (if present)
  if (dispatch && (!dispatch.stops || dispatch.stops.length <= 1)) {
    const rawItems = (dispatch as any).dispatch_items;
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      return rawItems.map((di: any) => {
        const prod = Array.isArray(di.products) ? di.products[0] : di.products;
        const loadedQty = Number(di.quantity_loaded) || 0;
        return {
          productId: di.product_id,
          productName: prod?.name || "Handcrafted Stick",
          sku: prod?.sku || "SKU-STICK",
          packType: "Box of 10 Sticks (1 Crate)",
          requestedPacks: loadedQty,
          requestedUnits: loadedQty * STICKS_PER_CRATE,
          approvedPacks: loadedQty,
          approvedUnits: loadedQty * STICKS_PER_CRATE,
          packedUnits: loadedQty * STICKS_PER_CRATE,
        };
      });
    }
  }

  return [];
}

/**
 * Calculates the cargo totals for a specific stop within a dispatch.
 */
export function calculateStopCargo(
  stop: DispatchStop,
  dispatch?: DispatchBatch | null,
  ordersList: AdminOrder[] = []
): CargoCalculationResult {
  const items = resolveStopItems(stop, dispatch, ordersList);
  if (items.length > 0) {
    return calculateItemsCargo(items);
  }

  // If no items were resolved but the dispatch has authoritative totalUnits for a single stop
  if (dispatch && (!dispatch.stops || dispatch.stops.length <= 1) && (dispatch.totalUnits || 0) > 0) {
    const sticks = dispatch.totalUnits || 0;
    const crates = Math.round(sticks / STICKS_PER_CRATE);
    return {
      crates,
      sticks,
      items: [],
      hasItems: false,
    };
  }

  return {
    crates: 0,
    sticks: 0,
    items: [],
    hasItems: false,
  };
}

/**
 * Calculates the total cargo for a complete dispatch across all its route stops.
 * Guarantees that:
 * 1. Total crates = sum of crates across all stops.
 * 2. Total sticks = sum of sticks across all stops.
 * 3. Individual stops retain isolated cargo allocations.
 */
export function calculateDispatchCargo(
  dispatch: DispatchBatch,
  ordersList: AdminOrder[] = []
): DispatchCargoResult {
  let totalCrates = 0;
  let totalSticks = 0;
  const stopsCargo: Record<string, CargoCalculationResult> = {};

  if (dispatch.stops && dispatch.stops.length > 0) {
    for (const stop of dispatch.stops) {
      const sCargo = calculateStopCargo(stop, dispatch, ordersList);
      stopsCargo[stop.branchId] = sCargo;
      totalCrates += sCargo.crates;
      totalSticks += sCargo.sticks;
    }
  }

  // If stop items were not resolved, but dispatch has authoritative totalUnits from DB
  if (totalCrates === 0 && (dispatch.totalUnits || 0) > 0) {
    totalSticks = dispatch.totalUnits || 0;
    totalCrates = Math.round(totalSticks / STICKS_PER_CRATE);

    if (dispatch.stops && dispatch.stops.length === 1) {
      const s = dispatch.stops[0];
      stopsCargo[s.branchId] = {
        crates: totalCrates,
        sticks: totalSticks,
        items: [],
        hasItems: false,
      };
    }
  }

  return {
    crates: totalCrates,
    sticks: totalSticks > 0 ? totalSticks : totalCrates * STICKS_PER_CRATE,
    stopsCargo,
  };
}

