export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      flavours: {
        Row: {
          id: string
          index: number
          name: string
          tagline: string
          description: string
          category: string
          color: string
          glow: string
          stick_img: string
          showcase_img: string
          is_popular: boolean
          created_at: string
        }
        Insert: {
          id: string
          index: number
          name: string
          tagline: string
          description: string
          category: string
          color: string
          glow: string
          stick_img: string
          showcase_img: string
          is_popular?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          index?: number
          name?: string
          tagline?: string
          description?: string
          category?: string
          color?: string
          glow?: string
          stick_img?: string
          showcase_img?: string
          is_popular?: boolean
          created_at?: string
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
          status: string
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
          status?: string
          is_factory_headquarters?: boolean
          phone?: string | null
          map_query?: string | null
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
          enquiry_type: string
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
