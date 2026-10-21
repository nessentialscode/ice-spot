import { FLAVOURS } from "@/lib/data/flavours";
import { BRANCHES } from "@/lib/data/branches";
import {
  AdminProduct,
  AdminOrder,
  DispatchBatch,
  AdminUserAccount,
  DiscrepancyReport,
  InventoryAdjustmentLog
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

export const INITIAL_ADMIN_ORDERS: AdminOrder[] = [
  {
    id: "ord-104",
    orderNumber: "ORD-2026-104",
    branchId: "ollur-branch",
    branchName: "Ice Spot Ollur",
    district: "Thrissur",
    submittedAt: "2026-10-20 09:30 AM",
    requestedDeliveryDate: "2026-10-22",
    status: "submitted",
    totalUnitsRequested: 384, // 16 packs * 24
    totalUnitsApproved: 0,
    branchNotes: "Please deliver before 11 AM due to local festival rush on Thursday.",
    timeline: [
      {
        id: "tl-104-1",
        timestamp: "2026-10-20 09:30 AM",
        status: "submitted",
        actorName: "Rahul Varma",
        actorRole: "Branch Admin",
        note: "Weekly branch order created and submitted for factory review"
      }
    ],
    items: [
      {
        productId: "strawberry",
        productName: "Sweet Strawberry",
        sku: "SKU-STK-001",
        packType: "Crate (24 Sticks)",
        requestedPacks: 4,
        requestedUnits: 96,
        approvedPacks: 0,
        approvedUnits: 0
      },
      {
        productId: "mango",
        productName: "Alphonso Mango",
        sku: "SKU-STK-003",
        packType: "Crate (24 Sticks)",
        requestedPacks: 6,
        requestedUnits: 144,
        approvedPacks: 0,
        approvedUnits: 0
      },
      {
        productId: "tender-coconut",
        productName: "Tender Coconut Special",
        sku: "SKU-STK-005",
        packType: "Crate (24 Sticks)",
        requestedPacks: 4,
        requestedUnits: 96,
        approvedPacks: 0,
        approvedUnits: 0
      },
      {
        productId: "jackfruit",
        productName: "Varikka Chakka Honey",
        sku: "SKU-STK-004",
        packType: "Crate (24 Sticks)",
        requestedPacks: 2,
        requestedUnits: 48,
        approvedPacks: 0,
        approvedUnits: 0
      }
    ]
  },
  {
    id: "ord-103",
    orderNumber: "ORD-2026-103",
    branchId: "thrissur-town",
    branchName: "Ice Spot Thrissur Town",
    district: "Thrissur",
    submittedAt: "2026-10-19 04:15 PM",
    requestedDeliveryDate: "2026-10-21",
    status: "under-review",
    totalUnitsRequested: 480,
    totalUnitsApproved: 0,
    branchNotes: "Weekend replenishment. Please include promotional shelf stickers if available.",
    timeline: [
      {
        id: "tl-103-1",
        timestamp: "2026-10-19 04:15 PM",
        status: "submitted",
        actorName: "Sreelakshmi P.",
        actorRole: "Branch Admin",
        note: "Submitted weekly order"
      },
      {
        id: "tl-103-2",
        timestamp: "2026-10-20 08:00 AM",
        status: "under-review",
        actorName: "M. Faizal",
        actorRole: "Super Admin",
        note: "Reviewing factory stock allocation"
      }
    ],
    items: [
      {
        productId: "mango",
        productName: "Alphonso Mango",
        sku: "SKU-STK-003",
        packType: "Crate (24 Sticks)",
        requestedPacks: 8,
        requestedUnits: 192,
        approvedPacks: 0,
        approvedUnits: 0
      },
      {
        productId: "pistachio",
        productName: "Pista Malai Kulfi",
        sku: "SKU-STK-006",
        packType: "Crate (24 Sticks)",
        requestedPacks: 5,
        requestedUnits: 120,
        approvedPacks: 0,
        approvedUnits: 0
      },
      {
        productId: "belgian-chocolate",
        productName: "Belgian Dark Crunch",
        sku: "SKU-STK-007",
        packType: "Crate (24 Sticks)",
        requestedPacks: 7,
        requestedUnits: 168,
        approvedPacks: 0,
        approvedUnits: 0
      }
    ]
  },
  {
    id: "ord-102",
    orderNumber: "ORD-2026-102",
    branchId: "chalakudy-junction",
    branchName: "Ice Spot Chalakudy",
    district: "Thrissur",
    submittedAt: "2026-10-18 11:20 AM",
    requestedDeliveryDate: "2026-10-21",
    status: "approved",
    totalUnitsRequested: 360,
    totalUnitsApproved: 360,
    factoryNotes: "Full quantity approved. Assigned to batch DSP-VRV-090 for Wednesday morning dispatch.",
    timeline: [
      {
        id: "tl-102-1",
        timestamp: "2026-10-18 11:20 AM",
        status: "submitted",
        actorName: "Arun Nair",
        actorRole: "Branch Admin",
        note: "Submitted regular order"
      },
      {
        id: "tl-102-2",
        timestamp: "2026-10-18 02:40 PM",
        status: "approved",
        actorName: "M. Faizal",
        actorRole: "Super Admin",
        note: "Approved in full. Stock reserved at Varavoor Cold Room 2"
      }
    ],
    items: [
      {
        productId: "strawberry",
        productName: "Sweet Strawberry",
        sku: "SKU-STK-001",
        packType: "Crate (24 Sticks)",
        requestedPacks: 5,
        requestedUnits: 120,
        approvedPacks: 5,
        approvedUnits: 120
      },
      {
        productId: "passion-fruit",
        productName: "Wild Passion Fruit",
        sku: "SKU-STK-008",
        packType: "Crate (24 Sticks)",
        requestedPacks: 5,
        requestedUnits: 120,
        approvedPacks: 5,
        approvedUnits: 120
      },
      {
        productId: "tender-coconut",
        productName: "Tender Coconut Special",
        sku: "SKU-STK-005",
        packType: "Crate (24 Sticks)",
        requestedPacks: 5,
        requestedUnits: 120,
        approvedPacks: 5,
        approvedUnits: 120
      }
    ]
  },
  {
    id: "ord-101",
    orderNumber: "ORD-2026-101",
    branchId: "kuriachira-branch",
    branchName: "Ice Spot Kuriachira",
    district: "Thrissur",
    submittedAt: "2026-10-17 01:10 PM",
    requestedDeliveryDate: "2026-10-20",
    status: "dispatched",
    totalUnitsRequested: 240,
    totalUnitsApproved: 240,
    assignedDispatchId: "dsp-089",
    factoryNotes: "Loaded in Reefer Van KL-08-AX-4412",
    timeline: [
      {
        id: "tl-101-1",
        timestamp: "2026-10-17 01:10 PM",
        status: "submitted",
        actorName: "Geetha C.",
        actorRole: "Branch Admin",
        note: "Order submitted"
      },
      {
        id: "tl-101-2",
        timestamp: "2026-10-18 10:00 AM",
        status: "approved",
        actorName: "M. Faizal",
        actorRole: "Super Admin",
        note: "Approved for Monday route"
      },
      {
        id: "tl-101-3",
        timestamp: "2026-10-20 07:45 AM",
        status: "dispatched",
        actorName: "Suresh K.",
        actorRole: "Delivery Staff",
        note: "Loaded and departed Varavoor Factory"
      }
    ],
    items: [
      {
        productId: "guava",
        productName: "Creamy Guava & Mint",
        sku: "SKU-STK-002",
        packType: "Crate (24 Sticks)",
        requestedPacks: 4,
        requestedUnits: 96,
        approvedPacks: 4,
        approvedUnits: 96,
        packedUnits: 96
      },
      {
        productId: "mango",
        productName: "Alphonso Mango",
        sku: "SKU-STK-003",
        packType: "Crate (24 Sticks)",
        requestedPacks: 6,
        requestedUnits: 144,
        approvedPacks: 6,
        approvedUnits: 144,
        packedUnits: 144
      }
    ]
  },
  {
    id: "ord-098",
    orderNumber: "ORD-2026-098",
    branchId: "palakkad-fort-road",
    branchName: "Ice Spot Palakkad Town",
    district: "Palakkad",
    submittedAt: "2026-10-15 10:00 AM",
    requestedDeliveryDate: "2026-10-18",
    status: "delivered",
    totalUnitsRequested: 312,
    totalUnitsApproved: 312,
    factoryNotes: "Delivery fulfilled. Pending branch confirmation receipt check.",
    timeline: [
      {
        id: "tl-098-1",
        timestamp: "2026-10-15 10:00 AM",
        status: "submitted",
        actorName: "Manoj K.",
        actorRole: "Branch Admin",
        note: "Weekly branch requisition"
      },
      {
        id: "tl-098-2",
        timestamp: "2026-10-16 11:30 AM",
        status: "approved",
        actorName: "M. Faizal",
        actorRole: "Super Admin",
        note: "Approved"
      },
      {
        id: "tl-098-3",
        timestamp: "2026-10-18 01:15 PM",
        status: "delivered",
        actorName: "Rajesh Menon",
        actorRole: "Delivery Staff",
        note: "Delivered to branch freezer bay. Awaiting branch staff verification."
      }
    ],
    items: [
      {
        productId: "badam",
        productName: "Badam Pista Shahi",
        sku: "SKU-STK-009",
        packType: "Crate (24 Sticks)",
        requestedPacks: 7,
        requestedUnits: 168,
        approvedPacks: 7,
        approvedUnits: 168,
        packedUnits: 168,
        receivedUnits: 168
      },
      {
        productId: "kulukki",
        productName: "Malabar Kulukki Pop",
        sku: "SKU-STK-010",
        packType: "Crate (24 Sticks)",
        requestedPacks: 6,
        requestedUnits: 144,
        approvedPacks: 6,
        approvedUnits: 144,
        packedUnits: 144,
        receivedUnits: 144
      }
    ]
  },
  {
    id: "ord-095",
    orderNumber: "ORD-2026-095",
    branchId: "guruvayur-temple",
    branchName: "Ice Spot Guruvayur",
    district: "Thrissur",
    submittedAt: "2026-10-14 02:00 PM",
    requestedDeliveryDate: "2026-10-17",
    status: "amendment-requested",
    totalUnitsRequested: 240,
    totalUnitsApproved: 240,
    amendmentNotes: "URGENT: Requesting +2 additional Crates of Alphonso Mango and +1 Crate of Badam Pista due to surprise bus tour booking.",
    timeline: [
      {
        id: "tl-095-1",
        timestamp: "2026-10-14 02:00 PM",
        status: "submitted",
        actorName: "Deepak S.",
        actorRole: "Branch Admin",
        note: "Original order submitted"
      },
      {
        id: "tl-095-2",
        timestamp: "2026-10-15 09:30 AM",
        status: "approved",
        actorName: "M. Faizal",
        actorRole: "Super Admin",
        note: "Order approved"
      },
      {
        id: "tl-095-3",
        timestamp: "2026-10-16 11:20 AM",
        status: "amendment-requested",
        actorName: "Deepak S.",
        actorRole: "Branch Admin",
        note: "Branch submitted amendment request for additional crates"
      }
    ],
    items: [
      {
        productId: "mango",
        productName: "Alphonso Mango",
        sku: "SKU-STK-003",
        packType: "Crate (24 Sticks)",
        requestedPacks: 6,
        requestedUnits: 144,
        approvedPacks: 6,
        approvedUnits: 144
      },
      {
        productId: "badam",
        productName: "Badam Pista Shahi",
        sku: "SKU-STK-009",
        packType: "Crate (24 Sticks)",
        requestedPacks: 4,
        requestedUnits: 96,
        approvedPacks: 4,
        approvedUnits: 96
      }
    ]
  }
];

export const INITIAL_DISPATCH_BATCHES: DispatchBatch[] = [
  {
    id: "dsp-089",
    manifestNumber: "DSP-VRV-089",
    vehicleNumber: "KL-08-AX-4412 (Insulated Reefer Van)",
    driverId: "usr-del-1",
    driverName: "Suresh K.",
    driverPhone: "+91 98460 11223",
    dispatchDate: "2026-10-20",
    status: "in-transit",
    orderIds: ["ord-101"],
    totalUnits: 240,
    departedAt: "2026-10-20 07:45 AM",
    notes: "South Thrissur route: Wadakkanchery -> Thrissur Bypass -> Kuriachira",
    stops: [
      {
        id: "stop-089-1",
        orderId: "ord-101",
        orderNumber: "ORD-2026-101",
        branchId: "kuriachira-branch",
        branchName: "Ice Spot Kuriachira",
        district: "Thrissur",
        address: "Kuriachira Junction, Main Road, Thrissur, Kerala 680006",
        phone: "+91 94470 00004",
        sequence: 1,
        status: "in-transit",
        items: [
          {
            productId: "guava",
            productName: "Creamy Guava & Mint",
            sku: "SKU-STK-002",
            packType: "Crate (24 Sticks)",
            requestedPacks: 4,
            requestedUnits: 96,
            approvedPacks: 4,
            approvedUnits: 96,
            packedUnits: 96
          },
          {
            productId: "mango",
            productName: "Alphonso Mango",
            sku: "SKU-STK-003",
            packType: "Crate (24 Sticks)",
            requestedPacks: 6,
            requestedUnits: 144,
            approvedPacks: 6,
            approvedUnits: 144,
            packedUnits: 144
          }
        ]
      }
    ]
  },
  {
    id: "dsp-090",
    manifestNumber: "DSP-VRV-090",
    vehicleNumber: "KL-08-BY-8821 (Refrigerated Truck)",
    driverId: "usr-del-2",
    driverName: "Rajesh Menon",
    driverPhone: "+91 98471 44556",
    dispatchDate: "2026-10-21",
    status: "loading",
    orderIds: ["ord-102"],
    totalUnits: 360,
    notes: "Central Highway Route: Varavoor -> Amballur -> Chalakudy Junction",
    stops: [
      {
        id: "stop-090-1",
        orderId: "ord-102",
        orderNumber: "ORD-2026-102",
        branchId: "chalakudy-junction",
        branchName: "Ice Spot Chalakudy",
        district: "Thrissur",
        address: "South Junction, NH 544, Chalakudy, Thrissur, Kerala",
        phone: "+91 94470 00007",
        sequence: 1,
        status: "pending",
        items: [
          {
            productId: "strawberry",
            productName: "Sweet Strawberry",
            sku: "SKU-STK-001",
            packType: "Crate (24 Sticks)",
            requestedPacks: 5,
            requestedUnits: 120,
            approvedPacks: 5,
            approvedUnits: 120,
            packedUnits: 120
          },
          {
            productId: "passion-fruit",
            productName: "Wild Passion Fruit",
            sku: "SKU-STK-008",
            packType: "Crate (24 Sticks)",
            requestedPacks: 5,
            requestedUnits: 120,
            approvedPacks: 5,
            approvedUnits: 120,
            packedUnits: 120
          },
          {
            productId: "tender-coconut",
            productName: "Tender Coconut Special",
            sku: "SKU-STK-005",
            packType: "Crate (24 Sticks)",
            requestedPacks: 5,
            requestedUnits: 120,
            approvedPacks: 5,
            approvedUnits: 120,
            packedUnits: 120
          }
        ]
      }
    ]
  }
];

export const INITIAL_ADMIN_USERS: AdminUserAccount[] = [
  {
    id: "usr-sup-1",
    name: "M. Faizal",
    email: "faizal.operations@icespot.in",
    role: "super-admin",
    branchId: "varavoor-factory",
    branchName: "Varavoor Central Factory",
    status: "active",
    lastActive: "Just now",
    phone: "+91 94470 00101"
  },
  {
    id: "usr-br-1",
    name: "Rahul Varma",
    email: "rahul.ollur@icespot.in",
    role: "branch-admin",
    branchId: "ollur-branch",
    branchName: "Ice Spot Ollur",
    status: "active",
    lastActive: "15 mins ago",
    phone: "+91 94470 00002"
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
  },
  {
    id: "usr-del-1",
    name: "Suresh K.",
    email: "suresh.logistics@icespot.in",
    role: "delivery-staff",
    status: "active",
    lastActive: "5 mins ago",
    phone: "+91 98460 11223"
  },
  {
    id: "usr-del-2",
    name: "Rajesh Menon",
    email: "rajesh.transport@icespot.in",
    role: "delivery-staff",
    status: "active",
    lastActive: "35 mins ago",
    phone: "+91 98471 44556"
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
