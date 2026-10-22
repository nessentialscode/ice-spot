export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          role: string
          branch_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          role?: string
          branch_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          role?: string
          branch_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          id: string
          name: string
          location: string
          district: string
          region: string
          sub_region: string | null
          status: string
          is_factory_headquarters: boolean
          phone: string | null
          map_query: string | null
          created_at: string
        }
        Insert: {
          id: string
          name: string
          location: string
          district: string
          region: string
          sub_region?: string | null
          status?: string
          is_factory_headquarters?: boolean
          phone?: string | null
          map_query?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          location?: string
          district?: string
          region?: string
          sub_region?: string | null
          status?: string
          is_factory_headquarters?: boolean
          phone?: string | null
          map_query?: string | null
          created_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          name: string
          sku: string
          category: string
          pack_type: string
          units_per_pack: number
          image_url: string | null
          color: string | null
          is_available: boolean
          is_active: boolean
          current_stock: number
          reserved_stock: number
          min_stock_alert: number
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id: string
          name: string
          sku: string
          category: string
          pack_type: string
          units_per_pack?: number
          image_url?: string | null
          color?: string | null
          is_available?: boolean
          is_active?: boolean
          current_stock?: number
          reserved_stock?: number
          min_stock_alert?: number
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          sku?: string
          category?: string
          pack_type?: string
          units_per_pack?: number
          image_url?: string | null
          color?: string | null
          is_available?: boolean
          is_active?: boolean
          current_stock?: number
          reserved_stock?: number
          min_stock_alert?: number
          created_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string
          product_id: string
          branch_id: string | null
          stock_level: number
          reserved_level: number
          last_counted_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          product_id: string
          branch_id?: string | null
          stock_level?: number
          reserved_level?: number
          last_counted_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          branch_id?: string | null
          stock_level?: number
          reserved_level?: number
          last_counted_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          order_number: string
          branch_id: string
          branch_name: string
          district: string
          status: string
          submitted_at: string
          requested_delivery_date: string
          branch_notes: string | null
          factory_notes: string | null
          total_units_requested: number
          total_units_approved: number
          amendment_notes: string | null
          cancel_reason: string | null
          assigned_dispatch_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          order_number: string
          branch_id: string
          branch_name: string
          district: string
          status?: string
          submitted_at?: string
          requested_delivery_date: string
          branch_notes?: string | null
          factory_notes?: string | null
          total_units_requested?: number
          total_units_approved?: number
          amendment_notes?: string | null
          cancel_reason?: string | null
          assigned_dispatch_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          order_number?: string
          branch_id?: string
          branch_name?: string
          district?: string
          status?: string
          submitted_at?: string
          requested_delivery_date?: string
          branch_notes?: string | null
          factory_notes?: string | null
          total_units_requested?: number
          total_units_approved?: number
          amendment_notes?: string | null
          cancel_reason?: string | null
          assigned_dispatch_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          product_name: string
          sku: string
          pack_type: string
          requested_packs: number
          requested_units: number
          approved_packs: number
          approved_units: number
          packed_units: number | null
          received_units: number | null
          damaged_units: number | null
          missing_units: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          product_name: string
          sku: string
          pack_type: string
          requested_packs?: number
          requested_units?: number
          approved_packs?: number
          approved_units?: number
          packed_units?: number | null
          received_units?: number | null
          damaged_units?: number | null
          missing_units?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          product_name?: string
          sku?: string
          pack_type?: string
          requested_packs?: number
          requested_units?: number
          approved_packs?: number
          approved_units?: number
          packed_units?: number | null
          received_units?: number | null
          damaged_units?: number | null
          missing_units?: number | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      order_amendments: {
        Row: {
          id: string
          order_id: string
          requested_by: string | null
          notes: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          requested_by?: string | null
          notes: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          requested_by?: string | null
          notes?: string
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      dispatches: {
        Row: {
          id: string
          manifest_number: string
          vehicle_number: string
          driver_id: string | null
          driver_name: string
          driver_phone: string | null
          dispatch_date: string
          status: string
          total_units: number
          notes: string | null
          departed_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          manifest_number: string
          vehicle_number: string
          driver_id?: string | null
          driver_name: string
          driver_phone?: string | null
          dispatch_date?: string
          status?: string
          total_units?: number
          notes?: string | null
          departed_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          manifest_number?: string
          vehicle_number?: string
          driver_id?: string | null
          driver_name?: string
          driver_phone?: string | null
          dispatch_date?: string
          status?: string
          total_units?: number
          notes?: string | null
          departed_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      dispatch_items: {
        Row: {
          id: string
          dispatch_id: string
          order_id: string
          sequence: number
          status: string
          delivered_units: number | null
          delivery_notes: string | null
          failure_reason: string | null
          arrived_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          dispatch_id: string
          order_id: string
          sequence?: number
          status?: string
          delivered_units?: number | null
          delivery_notes?: string | null
          failure_reason?: string | null
          arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          dispatch_id?: string
          order_id?: string
          sequence?: number
          status?: string
          delivered_units?: number | null
          delivery_notes?: string | null
          failure_reason?: string | null
          arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          id: string
          order_id: string
          branch_id: string
          received_by: string | null
          status: string
          discrepancy_reported: boolean
          discrepancy_notes: string | null
          received_at: string
        }
        Insert: {
          id?: string
          order_id: string
          branch_id: string
          received_by?: string | null
          status?: string
          discrepancy_reported?: boolean
          discrepancy_notes?: string | null
          received_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          branch_id?: string
          received_by?: string | null
          status?: string
          discrepancy_reported?: boolean
          discrepancy_notes?: string | null
          received_at?: string
        }
        Relationships: []
      }
      receipt_items: {
        Row: {
          id: string
          receipt_id: string
          product_id: string
          received_units: number
          missing_units: number
          damaged_units: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          receipt_id: string
          product_id: string
          received_units?: number
          missing_units?: number
          damaged_units?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          receipt_id?: string
          product_id?: string
          received_units?: number
          missing_units?: number
          damaged_units?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          changes: Json | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          changes?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          changes?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Relationships: []
      }
      enquiries: {
        Row: {
          id: string
          name: string
          phone: string
          email: string | null
          flavour_interest: string | null
          enquiry_type: string
          message: string
          created_at: string
          status: string
        }
        Insert: {
          id?: string
          name: string
          phone: string
          email?: string | null
          flavour_interest?: string | null
          enquiry_type?: string
          message: string
          created_at?: string
          status?: string
        }
        Update: {
          id?: string
          name?: string
          phone?: string
          email?: string | null
          flavour_interest?: string | null
          enquiry_type?: string
          message?: string
          created_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
