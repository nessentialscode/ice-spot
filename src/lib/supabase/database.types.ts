export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type BranchCategory =
  | "thrissur_town"
  | "thrissur_coastal"
  | "ernakulam"
  | "palakkad"
  | "malappuram";

export type AppRole = "super_admin" | "branch_admin" | "delivery_staff";
export type UserRole = AppRole;

export type OrderStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "preparation"
  | "ready_for_dispatch"
  | "dispatched"
  | "partially_delivered"
  | "delivered"
  | "amendment_requested"
  | "cancelled";

export type DispatchStatus =
  | "scheduled"
  | "loading"
  | "in_transit"
  | "completed"
  | "cancelled";

export type ReceiptStatus = "intact" | "discrepancy" | "rejected";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: string;
          branch_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: string;
          branch_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: string;
          branch_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          }
        ];
      };
      branches: {
        Row: {
          id: string;
          name: string;
          code: string;
          category: BranchCategory;
          address: string;
          locality: string | null;
          district: string;
          contact_name: string | null;
          contact_phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          category: BranchCategory;
          address: string;
          locality?: string | null;
          district: string;
          contact_name?: string | null;
          contact_phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          category?: BranchCategory;
          address?: string;
          locality?: string | null;
          district?: string;
          contact_name?: string | null;
          contact_phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          unit: string;
          selling_price: number | null;
          is_active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          description?: string | null;
          unit?: string;
          selling_price?: number | null;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          sku?: string;
          name?: string;
          description?: string | null;
          unit?: string;
          selling_price?: number | null;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      inventory: {
        Row: {
          id: string;
          product_id: string;
          branch_id: string | null;
          quantity: number;
          reserved_quantity: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          branch_id?: string | null;
          quantity?: number;
          reserved_quantity?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          branch_id?: string | null;
          quantity?: number;
          reserved_quantity?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      orders: {
        Row: {
          id: string;
          order_number: number;
          branch_id: string;
          week_start: string;
          status: string;
          notes: string | null;
          created_by: string;
          submitted_at: string | null;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          order_number?: number;
          branch_id: string;
          week_start: string;
          status?: string;
          notes?: string | null;
          created_by: string;
          submitted_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          order_number?: number;
          branch_id?: string;
          week_start?: string;
          status?: string;
          notes?: string | null;
          created_by?: string;
          submitted_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          }
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          requested_quantity: number;
          approved_quantity: number | null;
          unit_price: number | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          requested_quantity: number;
          approved_quantity?: number | null;
          unit_price?: number | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          requested_quantity?: number;
          approved_quantity?: number | null;
          unit_price?: number | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      dispatches: {
        Row: {
          id: string;
          dispatch_number: number;
          order_id: string | null;
          delivery_staff_id: string | null;
          status: string;
          dispatched_at: string | null;
          delivered_at: string | null;
          delivery_notes: string | null;
          proof_of_delivery_url: string | null;
          created_by: string;
          created_at: string;
          updated_at: string | null;
          vehicle_number?: string | null;
          departure_time?: string | null;
          loading_bay?: string | null;
        };
        Insert: {
          id?: string;
          dispatch_number?: number;
          order_id?: string | null;
          delivery_staff_id?: string | null;
          status?: string;
          dispatched_at?: string | null;
          delivered_at?: string | null;
          delivery_notes?: string | null;
          proof_of_delivery_url?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string | null;
          vehicle_number?: string | null;
          departure_time?: string | null;
          loading_bay?: string | null;
        };
        Update: {
          id?: string;
          dispatch_number?: number;
          order_id?: string | null;
          delivery_staff_id?: string | null;
          status?: string;
          dispatched_at?: string | null;
          delivered_at?: string | null;
          delivery_notes?: string | null;
          proof_of_delivery_url?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string | null;
          vehicle_number?: string | null;
          departure_time?: string | null;
          loading_bay?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "dispatches_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      dispatch_orders: {
        Row: {
          id: string;
          dispatch_id: string;
          order_id: string;
          sequence: number;
          status: string;
          delivery_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          dispatch_id: string;
          order_id: string;
          sequence?: number;
          status?: string;
          delivery_notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          dispatch_id?: string;
          order_id?: string;
          sequence?: number;
          status?: string;
          delivery_notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dispatch_orders_dispatch_id_fkey";
            columns: ["dispatch_id"];
            isOneToOne: false;
            referencedRelation: "dispatches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_orders_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      dispatch_items: {
        Row: {
          id: string;
          dispatch_id: string;
          product_id: string;
          quantity_loaded: number;
          quantity_delivered: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          dispatch_id: string;
          product_id: string;
          quantity_loaded: number;
          quantity_delivered?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          dispatch_id?: string;
          product_id?: string;
          quantity_loaded?: number;
          quantity_delivered?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dispatch_items_dispatch_id_fkey";
            columns: ["dispatch_id"];
            isOneToOne: false;
            referencedRelation: "dispatches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      receipts: {
        Row: {
          id: string;
          dispatch_id: string;
          order_id: string | null;
          confirmed_by: string;
          receipt_status: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          dispatch_id: string;
          order_id?: string | null;
          confirmed_by: string;
          receipt_status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          dispatch_id?: string;
          order_id?: string | null;
          confirmed_by?: string;
          receipt_status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "receipts_dispatch_id_fkey";
            columns: ["dispatch_id"];
            isOneToOne: false;
            referencedRelation: "dispatches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipts_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      receipt_items: {
        Row: {
          id: string;
          receipt_id: string;
          quantity_expected: number;
          quantity_received: number | null;
          discrepancy_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          receipt_id: string;
          quantity_expected: number;
          quantity_received?: number | null;
          discrepancy_note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          receipt_id?: string;
          quantity_expected?: number;
          quantity_received?: number | null;
          discrepancy_note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "receipt_items_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "receipts";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      enquiries: {
        Row: {
          id: string;
          name: string;
          phone: string;
          email: string | null;
          flavour_interest: string | null;
          enquiry_type: string;
          message: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          email?: string | null;
          flavour_interest?: string | null;
          enquiry_type?: string;
          message: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          email?: string | null;
          flavour_interest?: string | null;
          enquiry_type?: string;
          message?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      rpc_create_order: {
        Args: {
          p_branch_id: string;
          p_week_start: string;
          p_notes: string | null;
          p_items: Json;
        };
        Returns: {
          success: boolean;
          order_id: string;
          order_number: number;
        };
      };
      rpc_approve_order: {
        Args: {
          p_order_id: string;
          p_approved_items: Json | null;
          p_notes: string | null;
        };
        Returns: {
          success: boolean;
          order_id: string;
          order_number: number;
          status: string;
        };
      };
      rpc_create_dispatch: {
        Args: {
          p_order_ids: string[];
          p_delivery_staff_id: string | null;
          p_notes: string | null;
          p_items: Json | null;
        };
        Returns: {
          success: boolean;
          dispatch_id: string;
          dispatch_number: number;
        };
      };
      rpc_update_delivery_stop: {
        Args: {
          p_dispatch_id: string;
          p_order_id: string;
          p_status: string;
          p_notes: string | null;
          p_delivered_items: Json | null;
        };
        Returns: {
          success: boolean;
          dispatch_id: string;
          order_id: string;
          status: string;
        };
      };
      rpc_adjust_inventory: {
        Args: {
          p_product_id: string;
          p_branch_id: string | null;
          p_delta: number;
          p_reason: string;
          p_release_reserved?: number;
        };
        Returns: {
          success: boolean;
          product_id: string;
          branch_id: string | null;
          quantity: number;
          reserved_quantity?: number;
        };
      };
      rpc_confirm_receipt: {
        Args: {
          p_dispatch_id: string;
          p_order_id: string;
          p_receipt_status: string;
          p_notes: string | null;
          p_items: Json | null;
        };
        Returns: {
          success: boolean;
          receipt_id: string;
          order_id: string;
          status: string;
          already_confirmed?: boolean;
          message?: string;
        };
      };
      rpc_get_orders: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      rpc_get_eligible_orders_for_dispatch: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      rpc_update_dispatch_trip: {
        Args: {
          p_dispatch_id: string;
          p_vehicle_number?: string | null;
          p_departure_time?: string | null;
          p_status?: string | null;
          p_notes?: string | null;
        };
        Returns: {
          success: boolean;
          dispatch_id: string;
          dispatch_number: number;
          manifest_number: string;
          status: string;
          vehicle_number?: string | null;
          departure_time?: string | null;
          delivery_notes?: string | null;
          updated_at: string;
        };
      };
      is_super_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      current_branch_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      current_app_role: {
        Args: Record<PropertyKey, never>;
        Returns: AppRole;
      };
    };
    Enums: {
      branch_category: BranchCategory;
      app_role: AppRole;
      order_status: OrderStatus;
      dispatch_status: DispatchStatus;
      receipt_status: ReceiptStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
