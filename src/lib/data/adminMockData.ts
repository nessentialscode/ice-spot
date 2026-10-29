import { FLAVOURS } from "@/lib/data/flavours";
import { BRANCHES } from "@/lib/data/branches";
import {
  AdminProduct,
  AdminOrder,
  DispatchBatch,
  AdminUserAccount,
  DiscrepancyReport,
  InventoryAdjustmentLog,
  Invoice,
  FleetVehicle
} from "@/types/admin";

export const INITIAL_ADMIN_PRODUCTS: AdminProduct[] = [
  ...FLAVOURS.map((f, idx) => ({
    id: f.id,
    name: f.name,
    sku: `SKU-STK-${(idx + 1).toString().padStart(3, "0")}`,
    category: f.category || "Fruit Ice Stick",
    packType: "Crate (24 Sticks)",
    unitsPerPack: 24,
    imageUrl: f.stickImg || "/assets/sticks/stick_strawberry.png",
    color: f.color || "#D83162",
    isAvailable: true,
    isActive: true,
    currentStock: [1200, 840, 1680, 520, 960, 480, 1100, 360, 720, 1340][idx % 10],
    reservedStock: [180, 120, 240, 96, 144, 72, 168, 48, 96, 216][idx % 10],
    minStockAlert: 400
  })),
  {
    id: "bulk-mango-tub",
    name: "Alphonso Pure Pulp Tub (5 Litre)",
    sku: "SKU-TUB-011",
    category: "Bulk Parlour Tubs",
    packType: "5L Commercial Tub",
    unitsPerPack: 1,
    imageUrl: "/assets/sticks/stick_mango.png",
    color: "#ff8c00",
    isAvailable: true,
    isActive: true,
    currentStock: 140,
    reservedStock: 35,
    minStockAlert: 30
  },
  {
    id: "bulk-kulfi-pot",
    name: "Royal Matka Kulfi Special Box",
    sku: "SKU-KUL-012",
    category: "Traditional Kulfi",
    packType: "Box of 12 Pots",
    unitsPerPack: 12,
    imageUrl: "/assets/sticks/stick_badam.png",
    color: "#d4a373",
    isAvailable: true,
    isActive: true,
    currentStock: 280,
    reservedStock: 60,
    minStockAlert: 100
  }
];

export const INITIAL_ADMIN_ORDERS: AdminOrder[] = [];

export const INITIAL_DISPATCH_BATCHES: DispatchBatch[] = [];

export const INITIAL_ADMIN_USERS: AdminUserAccount[] = [
  {
    id: "2236f15a-bba8-48ba-bd23-764380fb7cba",
    name: "Varavoor Factory Operations",
    email: "icespotvaravoor@gmail.com",
    role: "super-admin",
    branchId: "varavoor-factory",
    branchName: "Varavoor Central Factory",
    status: "active",
    lastActive: "Just now",
    phone: "+91 94470 00101"
  },
  {
    id: "99fce41f-a636-419f-855d-9f23db4769fb",
    name: "Thrissur Ollur Branch Admin",
    email: "icespotthrissur@gmail.com",
    role: "branch-admin",
    branchId: "ollur-branch",
    branchName: "Ice Spot Ollur",
    status: "active",
    lastActive: "Just now",
    phone: "+91 94470 00002"
  },
  {
    id: "cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43",
    name: "Icespot Logistics & Delivery Staff",
    email: "icespotstaff@gmail.com",
    role: "delivery-staff",
    status: "active",
    lastActive: "Just now",
    phone: "+91 98460 11223"
  },
  {
    id: "usr-br-2",
    name: "Sreelakshmi P.",
    email: "sree.thrissur@icespot.in",
    role: "branch-admin",
    branchId: "thrissur-town",
    branchName: "Ice Spot Thrissur Town",
    status: "active",
    lastActive: "1 hour ago",
    phone: "+91 94470 00001"
  },
  {
    id: "usr-br-3",
    name: "Arun Nair",
    email: "arun.chalakudy@icespot.in",
    role: "branch-admin",
    branchId: "chalakudy-junction",
    branchName: "Ice Spot Chalakudy",
    status: "active",
    lastActive: "Yesterday",
    phone: "+91 94470 00007"
  }
];

export const INITIAL_DISCREPANCIES: DiscrepancyReport[] = [
  {
    id: "disc-001",
    orderId: "ord-098",
    orderNumber: "ORD-2026-098",
    branchId: "palakkad-fort-road",
    branchName: "Ice Spot Palakkad Town",
    reportedAt: "2026-10-18 02:30 PM",
    discrepancyType: "damaged",
    missingItems: [],
    damagedItems: [
      {
        productId: "badam",
        name: "Badam Pista Shahi",
        quantity: 4
      }
    ],
    notes: "4 sticks crushed due to rough handling during unloading at entrance step. Carton intact.",
    status: "investigating",
    factoryResolutionNotes: "Replacement credit approved by Faizal for next weekly cycle."
  }
];

export const INITIAL_INVENTORY_LOGS: InventoryAdjustmentLog[] = [
  {
    id: "log-001",
    productId: "mango",
    productName: "Alphonso Mango",
    timestamp: "2026-10-20 06:30 AM",
    changeAmount: +480,
    newStockLevel: 1680,
    reason: "Production Output",
    actorName: "Varavoor Batch Crew A"
  },
  {
    id: "log-002",
    productId: "strawberry",
    productName: "Sweet Strawberry",
    timestamp: "2026-10-19 05:00 PM",
    changeAmount: +240,
    newStockLevel: 1200,
    reason: "Production Output",
    actorName: "Varavoor Batch Crew B"
  },
  {
    id: "log-003",
    productId: "guava",
    productName: "Creamy Guava & Mint",
    timestamp: "2026-10-20 07:30 AM",
    changeAmount: -96,
    newStockLevel: 744,
    reason: "Dispatch Fulfillment",
    actorName: "Dispatch Bay - DSP-089"
  }
];

export const INITIAL_ADMIN_INVOICES: Invoice[] = [
  {
    id: "inv-10001",
    invoiceNumber: "INV-2026-10001",
    orderId: "ord-102",
    orderNumber: "ORD-2026-102",
    branchId: "chalakudy-junction",
    branchName: "Ice Spot Chalakudy",
    branchCode: "BR-CLK-008",
    branchAddress: "Junction, Tramway Lane, Chalakudy, Thrissur district",
    branchPhone: "+91 94470 00007",
    district: "Thrissur",
    invoiceDate: "2026-10-21",
    subtotal: 5800.00,
    taxRate: 0.00,
    taxAmount: 0.00,
    grandTotal: 5800.00,
    status: "provisional",
    notes: "PROVISIONAL COMMERCIAL INVOICE — GST not calculated; tax configuration pending confirmation.",
    createdAt: "2026-10-21T08:30:00Z",
    items: [
      {
        productId: "mango",
        productName: "Alphonso Mango",
        sku: "SKU-STK-003",
        quantity: 8,
        unitPrice: 400.00,
        lineTotal: 3200.00
      },
      {
        productId: "strawberry",
        productName: "Sweet Strawberry",
        sku: "SKU-STK-001",
        quantity: 5,
        unitPrice: 360.00,
        lineTotal: 1800.00
      },
      {
        productId: "guava",
        productName: "Creamy Guava & Mint",
        sku: "SKU-STK-002",
        quantity: 2,
        unitPrice: 400.00,
        lineTotal: 800.00
      }
    ]
  }
];

export const INITIAL_FLEET_VEHICLES: FleetVehicle[] = [
  { id: "veh-1", registrationNumber: "KL-08-AX-4412", modelOrType: "Insulated Reefer Van", capacityCrates: 24, status: "available" },
  { id: "veh-2", registrationNumber: "KL-08-BY-8821", modelOrType: "Refrigerated Truck", capacityCrates: 40, status: "available" },
  { id: "veh-3", registrationNumber: "KL-48-Q-4102", modelOrType: "Express Reefer Van", capacityCrates: 20, status: "available" },
  { id: "veh-4", registrationNumber: "KL-08-CZ-9910", modelOrType: "Cold-Chain Reefer #04", capacityCrates: 24, status: "available" },
  { id: "veh-5", registrationNumber: "KL-08-DF-1044", modelOrType: "Deep-Freeze Cargo Van", capacityCrates: 18, status: "available" },
  { id: "veh-6", registrationNumber: "KL-48-M-7703", modelOrType: "Refrigerated Medium Truck", capacityCrates: 36, status: "available" },
];
