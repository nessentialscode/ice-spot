export type AdminRole = 'super-admin' | 'branch-admin' | 'delivery-staff';

export type OrderStatus =
  | 'draft'
  | 'submitted'
  | 'under-review'
  | 'approved'
  | 'preparation'
  | 'ready-for-dispatch'
  | 'dispatched'
  | 'partially-delivered'
  | 'delivered'
  | 'amendment-requested'
  | 'cancelled';

export type DeliveryTripStatus =
  | 'scheduled'
  | 'loading'
  | 'ready'
  | 'in-transit'
  | 'completed'
  | 'issues';

export type StopDeliveryStatus =
  | 'pending'
  | 'in-transit'
  | 'reached'
  | 'delivered'
  | 'partially-delivered'
  | 'failed';

export interface AdminProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  packType: string; // e.g. "Box of 24 Sticks", "Tub 5 Litres"
  unitsPerPack: number;
  imageUrl: string;
  color: string;
  isAvailable: boolean;
  isActive: boolean;
  currentStock: number; // in units/sticks
  reservedStock: number;
  minStockAlert: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  sku: string;
  packType: string;
  requestedPacks: number;
  requestedUnits: number;
  approvedPacks: number;
  approvedUnits: number;
  packedUnits?: number;
  receivedUnits?: number;
  damagedUnits?: number;
  missingUnits?: number;
  notes?: string;
}

export interface OrderTimelineEvent {
  id: string;
  timestamp: string;
  status: OrderStatus;
  actorName: string;
  actorRole: string;
  note?: string;
}

export interface AdminOrder {
  id: string;
  orderNumber: string; // e.g. "ORD-2026-101"
  branchId: string;
  branchName: string;
  district: string;
  submittedAt: string;
  requestedDeliveryDate: string;
  status: OrderStatus;
  items: OrderItem[];
  branchNotes?: string;
  factoryNotes?: string;
  totalUnitsRequested: number;
  totalUnitsApproved: number;
  timeline: OrderTimelineEvent[];
  amendmentNotes?: string;
  cancelReason?: string;
  assignedDispatchId?: string;
}

export interface DispatchStop {
  id: string;
  orderId: string;
  orderNumber: string;
  branchId: string;
  branchName: string;
  district: string;
  address: string;
  phone: string;
  sequence: number;
  items: OrderItem[];
  status: StopDeliveryStatus;
  deliveredUnits?: number;
  deliveryNotes?: string;
  failureReason?: string;
  arrivedAt?: string;
  completedAt?: string;
}

export interface DispatchBatch {
  id: string;
  manifestNumber: string; // e.g. "DSP-VRV-089"
  vehicleNumber: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  dispatchDate: string;
  status: DeliveryTripStatus;
  orderIds: string[];
  stops: DispatchStop[];
  totalUnits: number;
  notes?: string;
  departedAt?: string;
  completedAt?: string;
}

export interface AdminUserAccount {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  branchId?: string;
  branchName?: string;
  status: 'active' | 'inactive';
  lastActive: string;
  phone: string;
}

export interface DiscrepancyReport {
  id: string;
  orderId: string;
  orderNumber: string;
  branchId: string;
  branchName: string;
  reportedAt: string;
  discrepancyType: 'missing' | 'damaged' | 'both';
  missingItems: { productId: string; name: string; quantity: number }[];
  damagedItems: { productId: string; name: string; quantity: number }[];
  notes: string;
  status: 'open' | 'investigating' | 'resolved';
  factoryResolutionNotes?: string;
}

export interface InventoryAdjustmentLog {
  id: string;
  productId: string;
  productName: string;
  timestamp: string;
  changeAmount: number;
  newStockLevel: number;
  reason: 'Production Output' | 'Damaged Stock' | 'Inventory Audit' | 'Manual Correction' | 'Dispatch Fulfillment';
  actorName: string;
}
