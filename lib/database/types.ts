export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      bill_items: {
        Row: {
          bill_id: string
          created_at: string
          id: string
          name: string
          quantity: number
          total_price_cents: number
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          bill_id: string
          created_at?: string
          id?: string
          name: string
          quantity?: number
          total_price_cents: number
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          bill_id?: string
          created_at?: string
          id?: string
          name?: string
          quantity?: number
          total_price_cents?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_even_shares"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_summaries"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_tip_shares"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          completed_at: string | null
          confirmed_total_cents: number | null
          created_at: string
          currency: string
          id: string
          receipt_path: string | null
          service_charge_cents: number
          split_mode: Database["public"]["Enums"]["split_mode"]
          status: string
          subtotal_cents: number
          table_id: string
          tax_cents: number
          tip_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          confirmed_total_cents?: number | null
          created_at?: string
          currency?: string
          id?: string
          receipt_path?: string | null
          service_charge_cents?: number
          split_mode?: Database["public"]["Enums"]["split_mode"]
          status?: string
          subtotal_cents?: number
          table_id: string
          tax_cents?: number
          tip_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          confirmed_total_cents?: number | null
          created_at?: string
          currency?: string
          id?: string
          receipt_path?: string | null
          service_charge_cents?: number
          split_mode?: Database["public"]["Enums"]["split_mode"]
          status?: string
          subtotal_cents?: number
          table_id?: string
          tax_cents?: number
          tip_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "admin_table_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      item_claims: {
        Row: {
          bill_item_id: string
          created_at: string
          id: string
          participant_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          bill_item_id: string
          created_at?: string
          id?: string
          participant_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          bill_item_id?: string
          created_at?: string
          id?: string
          participant_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_claims_bill_item_id_fkey"
            columns: ["bill_item_id"]
            isOneToOne: false
            referencedRelation: "bill_claim_details"
            referencedColumns: ["bill_item_id"]
          },
          {
            foreignKeyName: "item_claims_bill_item_id_fkey"
            columns: ["bill_item_id"]
            isOneToOne: false
            referencedRelation: "bill_item_assignments"
            referencedColumns: ["bill_item_id"]
          },
          {
            foreignKeyName: "item_claims_bill_item_id_fkey"
            columns: ["bill_item_id"]
            isOneToOne: false
            referencedRelation: "bill_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "bill_claim_details"
            referencedColumns: ["participant_id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "bill_even_shares"
            referencedColumns: ["participant_id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "bill_participant_totals"
            referencedColumns: ["participant_id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "bill_tip_shares"
            referencedColumns: ["participant_id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participant_totals"
            referencedColumns: ["participant_id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "table_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          id: string
          is_active: boolean
          is_admin: boolean
          joined_at: string
          last_seen_at: string | null
          name: string
          session_token: string | null
          settled_at: string | null
          settled_by: string | null
          table_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          is_admin?: boolean
          joined_at?: string
          last_seen_at?: string | null
          name: string
          session_token?: string | null
          settled_at?: string | null
          settled_by?: string | null
          table_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          is_admin?: boolean
          joined_at?: string
          last_seen_at?: string | null
          name?: string
          session_token?: string | null
          settled_at?: string | null
          settled_by?: string | null
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "admin_table_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          onboarding_completed: boolean
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          onboarding_completed?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          onboarding_completed?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      receipt_scans: {
        Row: {
          admin_id: string | null
          cost_micros: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          restaurant_id: string
          succeeded: boolean
          table_id: string | null
        }
        Insert: {
          admin_id?: string | null
          cost_micros?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          restaurant_id: string
          succeeded?: boolean
          table_id?: string | null
        }
        Update: {
          admin_id?: string | null
          cost_micros?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          restaurant_id?: string
          succeeded?: boolean
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_scans_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_scans_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_scans_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "admin_table_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_scans_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          city: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tables: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          invite_code: string
          name: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          invite_code?: string
          name: string
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          invite_code?: string
          name?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_table_summaries: {
        Row: {
          admin_id: string | null
          created_at: string | null
          currency: string | null
          id: string | null
          invite_code: string | null
          name: string | null
          people_count: number | null
          restaurant_id: string | null
          restaurant_name: string | null
          status: string | null
          total_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_claim_details: {
        Row: {
          amount_cents: number | null
          bill_id: string | null
          bill_item_id: string | null
          claimed_quantity: number | null
          is_admin: boolean | null
          item_created_at: string | null
          item_name: string | null
          item_quantity: number | null
          participant_id: string | null
          participant_name: string | null
          total_price_cents: number | null
          unit_price_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_even_shares"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_summaries"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_tip_shares"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_even_shares: {
        Row: {
          active_count: number | null
          bill_id: string | null
          name: string | null
          participant_id: string | null
          share_cents: number | null
        }
        Relationships: []
      }
      bill_item_assignments: {
        Row: {
          assigned_cents: number | null
          bill_id: string | null
          bill_item_id: string | null
          claimed_quantity: number | null
          name: string | null
          quantity: number | null
          total_price_cents: number | null
          unit_price_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_even_shares"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_summaries"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_tip_shares"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_participant_totals: {
        Row: {
          bill_id: string | null
          name: string | null
          participant_id: string | null
          total_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_even_shares"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_summaries"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_tip_shares"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_summaries: {
        Row: {
          assigned_cents: number | null
          bill_id: string | null
          confirmed_total_cents: number | null
          currency: string | null
          remaining_cents: number | null
          service_charge_cents: number | null
          status: string | null
          subtotal_cents: number | null
          table_id: string | null
          tax_cents: number | null
          tip_cents: number | null
          total_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "admin_table_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_tip_shares: {
        Row: {
          active_count: number | null
          bill_id: string | null
          name: string | null
          participant_id: string | null
          tip_share_cents: number | null
        }
        Relationships: []
      }
      item_claim_shares: {
        Row: {
          amount_cents: number | null
          bill_item_id: string | null
          participant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_claims_bill_item_id_fkey"
            columns: ["bill_item_id"]
            isOneToOne: false
            referencedRelation: "bill_claim_details"
            referencedColumns: ["bill_item_id"]
          },
          {
            foreignKeyName: "item_claims_bill_item_id_fkey"
            columns: ["bill_item_id"]
            isOneToOne: false
            referencedRelation: "bill_item_assignments"
            referencedColumns: ["bill_item_id"]
          },
          {
            foreignKeyName: "item_claims_bill_item_id_fkey"
            columns: ["bill_item_id"]
            isOneToOne: false
            referencedRelation: "bill_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "bill_claim_details"
            referencedColumns: ["participant_id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "bill_even_shares"
            referencedColumns: ["participant_id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "bill_participant_totals"
            referencedColumns: ["participant_id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "bill_tip_shares"
            referencedColumns: ["participant_id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participant_totals"
            referencedColumns: ["participant_id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "table_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_totals: {
        Row: {
          name: string | null
          participant_id: string | null
          table_id: string | null
          total_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "admin_table_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      table_participants: {
        Row: {
          id: string | null
          is_active: boolean | null
          is_admin: boolean | null
          joined_at: string | null
          last_seen_at: string | null
          name: string | null
          settled_at: string | null
          settled_by: string | null
          table_id: string | null
        }
        Insert: {
          id?: string | null
          is_active?: boolean | null
          is_admin?: boolean | null
          joined_at?: string | null
          last_seen_at?: string | null
          name?: string | null
          settled_at?: string | null
          settled_by?: string | null
          table_id?: string | null
        }
        Update: {
          id?: string | null
          is_active?: boolean | null
          is_admin?: boolean | null
          joined_at?: string | null
          last_seen_at?: string | null
          name?: string | null
          settled_at?: string | null
          settled_by?: string | null
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "admin_table_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_claim_item: {
        Args: { p_bill_item_id: string; p_quantity?: number }
        Returns: {
          item_id: string
          new_quantity: number
        }[]
      }
      admin_set_participant_claim: {
        Args: {
          p_bill_item_id: string
          p_participant_id: string
          p_quantity: number
        }
        Returns: {
          guest_id: string
          item_id: string
          now_claimed: number
        }[]
      }
      admin_update_item_claim: {
        Args: { p_bill_item_id: string; p_quantity: number }
        Returns: {
          item_id: string
          new_quantity: number
        }[]
      }
      admin_has_table_at: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      apply_assignment_status: {
        Args: { p_bill_id: string }
        Returns: undefined
      }
      bill_assigned_cents: { Args: { p_bill_id: string }; Returns: number }
      bill_claimable_cents: { Args: { p_bill_id: string }; Returns: number }
      bill_is_completed: { Args: { p_bill_id: string }; Returns: boolean }
      bill_remaining_cents: { Args: { p_bill_id: string }; Returns: number }
      broadcast_bill_change: {
        Args: { p_bill_id: string; p_event: string; p_source: string }
        Returns: undefined
      }
      broadcast_table_change: {
        Args: { p_event: string; p_source: string; p_table_id: string }
        Returns: undefined
      }
      calculate_bill_subtotal: { Args: { p_bill_id: string }; Returns: number }
      calculate_bill_total: { Args: { p_bill_id: string }; Returns: number }
      check_scan_receipt: {
        Args: {
          p_admin_id: string
          p_receipt_name: string
          p_receipt_tax_id: string
          p_table_id: string
        }
        Returns: {
          chosen_name: string
          receipt_name: string
          verdict: string
        }[]
      }
      claim_item: {
        Args: {
          p_bill_item_id: string
          p_quantity?: number
          p_session_token: string
        }
        Returns: {
          item_id: string
          new_quantity: number
        }[]
      }
      complete_bill: {
        Args: { p_bill_id: string }
        Returns: {
          completed_at: string | null
          confirmed_total_cents: number | null
          created_at: string
          currency: string
          id: string
          receipt_path: string | null
          service_charge_cents: number
          split_mode: Database["public"]["Enums"]["split_mode"]
          status: string
          subtotal_cents: number
          table_id: string
          tax_cents: number
          tip_cents: number
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bills"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_invite_code: { Args: { p_length?: number }; Returns: string }
      generate_session_token: { Args: never; Returns: string }
      get_admin_participant_id: {
        Args: { p_table_id: string }
        Returns: string
      }
      get_bill_assignment_summary: {
        Args: { p_session_token: string }
        Returns: {
          assigned_total_cents: number
          bill_id: string
          bill_total_cents: number
          currency: string
          percentage_assigned: number
          remaining_total_cents: number
          status: string
        }[]
      }
      get_guest_bill: {
        Args: { p_session_token: string }
        Returns: {
          assigned_cents: number
          currency: string
          id: string
          remaining_cents: number
          status: string
          total_cents: number
        }[]
      }
      get_guest_claims: {
        Args: { p_session_token: string }
        Returns: {
          bill_item_id: string
          participant_id: string
          quantity: number
        }[]
      }
      get_guest_even_shares: {
        Args: { p_session_token: string }
        Returns: {
          is_me: boolean
          participant_id: string
          participant_name: string
          share_cents: number
        }[]
      }
      get_guest_items: {
        Args: { p_session_token: string }
        Returns: {
          id: string
          name: string
          quantity: number
          total_price_cents: number
          unit_price_cents: number
        }[]
      }
      get_guest_items_with_claims: {
        Args: { p_session_token: string }
        Returns: {
          available_quantity: number
          can_claim_more: boolean
          claimed_quantity: number
          claims: Json
          id: string
          is_shared: boolean
          my_amount_cents: number
          my_quantity: number
          name: string
          quantity: number
          total_price_cents: number
          unit_price_cents: number
        }[]
      }
      get_guest_participants: {
        Args: { p_session_token: string }
        Returns: {
          id: string
          is_active: boolean
          is_admin: boolean
          joined_at: string
          name: string
        }[]
      }
      get_guest_receipt_path: {
        Args: { p_session_token: string }
        Returns: string
      }
      get_guest_settlements: {
        Args: { p_session_token: string }
        Returns: {
          is_me: boolean
          participant_id: string
          participant_name: string
          settled: boolean
          settled_at: string
        }[]
      }
      get_guest_table: {
        Args: { p_session_token: string }
        Returns: {
          id: string
          name: string
          restaurant_name: string
          status: string
        }[]
      }
      get_guest_tip_shares: {
        Args: { p_session_token: string }
        Returns: {
          is_me: boolean
          participant_id: string
          participant_name: string
          tip_share_cents: number
        }[]
      }
      get_guest_totals: {
        Args: { p_session_token: string }
        Returns: {
          is_me: boolean
          participant_id: string
          participant_name: string
          total_cents: number
        }[]
      }
      is_bill_admin: { Args: { p_bill_id: string }; Returns: boolean }
      is_bill_item_admin: { Args: { p_bill_item_id: string }; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_table_admin: { Args: { p_table_id: string }; Returns: boolean }
      item_assigned_cents: {
        Args: {
          p_claimed_quantity: number
          p_quantity: number
          p_total_price_cents: number
          p_unit_price_cents: number
        }
        Returns: number
      }
      join_table: {
        Args: {
          p_guest_name: string
          p_invite_code: string
          p_session_token?: string
        }
        Returns: {
          guest_name: string
          participant_id: string
          session_token: string
          table_id: string
        }[]
      }
      leave_table: { Args: { p_session_token: string }; Returns: undefined }
      lock_admin_claimable_item: {
        Args: { p_bill_item_id: string; p_require_open?: boolean }
        Returns: {
          item_name: string
          item_quantity: number
          participant_id: string
        }[]
      }
      lock_claimable_item: {
        Args: {
          p_bill_item_id: string
          p_require_open?: boolean
          p_session_token: string
        }
        Returns: {
          item_id: string
          item_name: string
          item_quantity: number
          participant_id: string
        }[]
      }
      normalise_business_name: { Args: { p_value: string }; Returns: string }
      normalise_tax_id: { Args: { p_value: string }; Returns: string }
      owner_delete_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: undefined
      }
      owner_merge_restaurants: {
        Args: { p_source: string; p_target: string }
        Returns: undefined
      }
      owner_restaurant_stats: {
        Args: never
        Returns: {
          bills_completed: number
          city: string
          is_active: boolean
          last_activity_at: string
          latitude: number
          longitude: number
          participants_total: number
          restaurant_id: string
          restaurant_name: string
          scan_cost_micros_this_month: number
          scans_this_month: number
          tables_active: number
          tables_total: number
          tax_id: string
        }[]
      }
      owns_receipt_object: { Args: { p_object_name: string }; Returns: boolean }
      record_receipt_scan: {
        Args: {
          p_admin_id: string
          p_cost_micros: number
          p_input_tokens: number
          p_model: string
          p_output_tokens: number
          p_succeeded: boolean
          p_table_id: string
        }
        Returns: undefined
      }
      remove_item_claim: {
        Args: { p_bill_item_id: string; p_session_token: string }
        Returns: undefined
      }
      resolve_guest_session: {
        Args: { p_require_active?: boolean; p_session_token: string }
        Returns: {
          id: string
          is_active: boolean
          is_admin: boolean
          joined_at: string
          last_seen_at: string | null
          name: string
          session_token: string | null
          settled_at: string | null
          settled_by: string | null
          table_id: string
        }
        SetofOptions: {
          from: "*"
          to: "participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_scan_restaurant: {
        Args: { p_admin_id: string; p_table_id: string }
        Returns: string
      }
      search_restaurants: {
        Args: { p_query: string }
        Returns: {
          city: string
          id: string
          name: string
        }[]
      }
      set_bill_split_mode: {
        Args: {
          p_bill_id: string
          p_mode: Database["public"]["Enums"]["split_mode"]
        }
        Returns: {
          completed_at: string | null
          confirmed_total_cents: number | null
          created_at: string
          currency: string
          id: string
          receipt_path: string | null
          service_charge_cents: number
          split_mode: Database["public"]["Enums"]["split_mode"]
          status: string
          subtotal_cents: number
          table_id: string
          tax_cents: number
          tip_cents: number
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bills"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_participant_settled: {
        Args: { p_participant_id: string; p_settled: boolean }
        Returns: {
          id: string
          is_active: boolean
          is_admin: boolean
          joined_at: string
          last_seen_at: string | null
          name: string
          session_token: string | null
          settled_at: string | null
          settled_by: string | null
          table_id: string
        }
        SetofOptions: {
          from: "*"
          to: "participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      split_remaining_evenly: {
        Args: { p_bill_item_id: string; p_participant_ids: string[] }
        Returns: {
          each_cents: number
          people: number
          shared_item_id: string
        }[]
      }
      start_bill: {
        Args: { p_bill_id: string }
        Returns: {
          completed_at: string | null
          confirmed_total_cents: number | null
          created_at: string
          currency: string
          id: string
          receipt_path: string | null
          service_charge_cents: number
          split_mode: Database["public"]["Enums"]["split_mode"]
          status: string
          subtotal_cents: number
          table_id: string
          tax_cents: number
          tip_cents: number
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bills"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_bill_subtotal: { Args: { p_bill_id: string }; Returns: undefined }
      update_item_claim: {
        Args: {
          p_bill_item_id: string
          p_quantity: number
          p_session_token: string
        }
        Returns: {
          item_id: string
          new_quantity: number
        }[]
      }
      validate_bill_completion: {
        Args: { p_bill_id: string }
        Returns: {
          is_valid: boolean
          reason: string
        }[]
      }
      validate_bill_totals: {
        Args: { p_bill_id: string }
        Returns: {
          is_valid: boolean
          reason: string
        }[]
      }
      validate_guest_session: {
        Args: { p_session_token: string }
        Returns: {
          guest_name: string
          is_active: boolean
          participant_id: string
          table_id: string
          table_status: string
        }[]
      }
    }
    Enums: {
      split_mode: "BY_ITEM" | "EVENLY"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      split_mode: ["BY_ITEM", "EVENLY"],
    },
  },
} as const
