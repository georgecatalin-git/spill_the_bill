// Generated from the Supabase schema. Do not edit by hand — regenerate with:
//   npx supabase gen types typescript --project-id osqjlsaphuxdjcagggxj > lib/database/types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.15';
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          onboarding_completed: boolean;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name: string;
          id: string;
          onboarding_completed?: boolean;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          onboarding_completed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      tables: {
        Row: {
          admin_id: string;
          created_at: string;
          id: string;
          invite_code: string;
          name: string;
          restaurant_name: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          admin_id: string;
          created_at?: string;
          id?: string;
          invite_code?: string;
          name: string;
          restaurant_name?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          admin_id?: string;
          created_at?: string;
          id?: string;
          invite_code?: string;
          name?: string;
          restaurant_name?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tables_admin_id_fkey';
            columns: ['admin_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      participants: {
        Row: {
          id: string;
          is_active: boolean;
          is_admin: boolean;
          joined_at: string;
          last_seen_at: string | null;
          name: string;
          session_token: string | null;
          table_id: string;
          settled_at: string | null;
          settled_by: string | null;
        };
        Insert: {
          id?: string;
          is_active?: boolean;
          is_admin?: boolean;
          joined_at?: string;
          last_seen_at?: string | null;
          name: string;
          session_token?: string | null;
          table_id: string;
          settled_at?: string | null;
          settled_by?: string | null;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          is_admin?: boolean;
          joined_at?: string;
          last_seen_at?: string | null;
          name?: string;
          session_token?: string | null;
          table_id?: string;
          settled_at?: string | null;
          settled_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'participants_table_id_fkey';
            columns: ['table_id'];
            isOneToOne: false;
            referencedRelation: 'tables';
            referencedColumns: ['id'];
          },
        ];
      };
      bills: {
        Row: {
          confirmed_total_cents: number | null;
          completed_at: string | null;
          created_at: string;
          currency: string;
          id: string;
          receipt_path: string | null;
          split_mode: 'BY_ITEM' | 'EVENLY';
          service_charge_cents: number;
          status: string;
          subtotal_cents: number;
          table_id: string;
          tax_cents: number;
          tip_cents: number;
          total_cents: number;
          updated_at: string;
        };
        Insert: {
          confirmed_total_cents?: number | null;
          receipt_path?: string | null;
          split_mode?: 'BY_ITEM' | 'EVENLY';
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          service_charge_cents?: number;
          status?: string;
          subtotal_cents?: number;
          table_id: string;
          tax_cents?: number;
          tip_cents?: number;
          total_cents?: number;
          updated_at?: string;
        };
        Update: {
          confirmed_total_cents?: number | null;
          receipt_path?: string | null;
          split_mode?: 'BY_ITEM' | 'EVENLY';
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          service_charge_cents?: number;
          status?: string;
          subtotal_cents?: number;
          table_id?: string;
          tax_cents?: number;
          tip_cents?: number;
          total_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bills_table_id_fkey';
            columns: ['table_id'];
            isOneToOne: false;
            referencedRelation: 'tables';
            referencedColumns: ['id'];
          },
        ];
      };
      bill_items: {
        Row: {
          bill_id: string;
          created_at: string;
          id: string;
          name: string;
          quantity: number;
          total_price_cents: number;
          unit_price_cents: number;
          updated_at: string;
        };
        Insert: {
          bill_id: string;
          created_at?: string;
          id?: string;
          name: string;
          quantity?: number;
          total_price_cents: number;
          unit_price_cents: number;
          updated_at?: string;
        };
        Update: {
          bill_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          quantity?: number;
          total_price_cents?: number;
          unit_price_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bill_items_bill_id_fkey';
            columns: ['bill_id'];
            isOneToOne: false;
            referencedRelation: 'bills';
            referencedColumns: ['id'];
          },
        ];
      };
      item_claims: {
        Row: {
          bill_item_id: string;
          created_at: string;
          id: string;
          participant_id: string;
          quantity: number;
          updated_at: string;
        };
        Insert: {
          bill_item_id: string;
          created_at?: string;
          id?: string;
          participant_id: string;
          quantity?: number;
          updated_at?: string;
        };
        Update: {
          bill_item_id?: string;
          created_at?: string;
          id?: string;
          participant_id?: string;
          quantity?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'item_claims_bill_item_id_fkey';
            columns: ['bill_item_id'];
            isOneToOne: false;
            referencedRelation: 'bill_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'item_claims_participant_id_fkey';
            columns: ['participant_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      table_participants: {
        Row: {
          id: string | null;
          is_active: boolean | null;
          is_admin: boolean | null;
          joined_at: string | null;
          last_seen_at: string | null;
          name: string | null;
          table_id: string | null;
          settled_at: string | null;
          settled_by: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'participants_table_id_fkey';
            columns: ['table_id'];
            isOneToOne: false;
            referencedRelation: 'tables';
            referencedColumns: ['id'];
          },
        ];
      };
      bill_item_assignments: {
        Row: {
          assigned_cents: number | null;
          bill_id: string | null;
          bill_item_id: string | null;
          claimed_quantity: number | null;
          name: string | null;
          quantity: number | null;
          total_price_cents: number | null;
          unit_price_cents: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bill_items_bill_id_fkey';
            columns: ['bill_id'];
            isOneToOne: false;
            referencedRelation: 'bills';
            referencedColumns: ['id'];
          },
        ];
      };
      item_claim_shares: {
        Row: {
          amount_cents: number | null;
          bill_item_id: string | null;
          participant_id: string | null;
        };
        Relationships: [];
      };
      participant_totals: {
        Row: {
          name: string | null;
          participant_id: string | null;
          table_id: string | null;
          total_cents: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'participants_table_id_fkey';
            columns: ['table_id'];
            isOneToOne: false;
            referencedRelation: 'tables';
            referencedColumns: ['id'];
          },
        ];
      };
      bill_participant_totals: {
        Row: {
          bill_id: string | null;
          name: string | null;
          participant_id: string | null;
          total_cents: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bill_items_bill_id_fkey';
            columns: ['bill_id'];
            isOneToOne: false;
            referencedRelation: 'bills';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_table_summaries: {
        Row: {
          id: string | null;
          admin_id: string | null;
          name: string | null;
          restaurant_name: string | null;
          status: string | null;
          invite_code: string | null;
          created_at: string | null;
          people_count: number | null;
          total_cents: number | null;
          currency: string | null;
        };
        Relationships: [];
      };
      bill_claim_details: {
        Row: {
          bill_id: string | null;
          bill_item_id: string | null;
          item_name: string | null;
          item_quantity: number | null;
          unit_price_cents: number | null;
          total_price_cents: number | null;
          item_created_at: string | null;
          participant_id: string | null;
          participant_name: string | null;
          is_admin: boolean | null;
          claimed_quantity: number | null;
          amount_cents: number | null;
        };
        Relationships: [];
      };
      bill_summaries: {
        Row: {
          assigned_cents: number | null;
          bill_id: string | null;
          currency: string | null;
          subtotal_cents: number | null;
          tax_cents: number | null;
          service_charge_cents: number | null;
          tip_cents: number | null;
          confirmed_total_cents: number | null;
          remaining_cents: number | null;
          status: string | null;
          table_id: string | null;
          total_cents: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bills_table_id_fkey';
            columns: ['table_id'];
            isOneToOne: false;
            referencedRelation: 'tables';
            referencedColumns: ['id'];
          },
        ];
      };
      bill_even_shares: {
        Row: {
          bill_id: string | null;
          participant_id: string | null;
          name: string | null;
          active_count: number | null;
          share_cents: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bills_table_id_fkey';
            columns: ['bill_id'];
            isOneToOne: false;
            referencedRelation: 'bills';
            referencedColumns: ['id'];
          },
        ];
      };
      bill_tip_shares: {
        Row: {
          bill_id: string | null;
          participant_id: string | null;
          name: string | null;
          active_count: number | null;
          tip_share_cents: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bills_table_id_fkey';
            columns: ['bill_id'];
            isOneToOne: false;
            referencedRelation: 'bills';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      // Guest invitation and session functions. Guests reach these as `anon`;
      // every one takes only a session token and resolves the table itself.
      join_table: {
        Args: { p_invite_code: string; p_guest_name: string; p_session_token?: string };
        Returns: {
          participant_id: string;
          table_id: string;
          guest_name: string;
          session_token: string;
        }[];
      };
      validate_guest_session: {
        Args: { p_session_token: string };
        Returns: {
          participant_id: string;
          table_id: string;
          guest_name: string;
          is_active: boolean;
          table_status: string;
        }[];
      };
      leave_table: { Args: { p_session_token: string }; Returns: undefined };
      get_guest_table: {
        Args: { p_session_token: string };
        Returns: { id: string; name: string; restaurant_name: string | null; status: string }[];
      };
      get_guest_participants: {
        Args: { p_session_token: string };
        Returns: {
          id: string;
          name: string;
          is_admin: boolean;
          is_active: boolean;
          joined_at: string;
        }[];
      };
      get_guest_bill: {
        Args: { p_session_token: string };
        Returns: {
          id: string;
          status: string;
          currency: string;
          total_cents: number;
          assigned_cents: number;
          remaining_cents: number;
        }[];
      };
      get_guest_items: {
        Args: { p_session_token: string };
        Returns: {
          id: string;
          name: string;
          quantity: number;
          unit_price_cents: number;
          total_price_cents: number;
        }[];
      };
      get_guest_claims: {
        Args: { p_session_token: string };
        Returns: { bill_item_id: string; participant_id: string; quantity: number }[];
      };
      // Guest item claims. Each takes only the session token; the server
      // resolves the participant and the table it may touch.
      claim_item: {
        Args: { p_session_token: string; p_bill_item_id: string; p_quantity?: number };
        Returns: { item_id: string; new_quantity: number }[];
      };
      update_item_claim: {
        Args: { p_session_token: string; p_bill_item_id: string; p_quantity: number };
        Returns: { item_id: string; new_quantity: number }[];
      };
      remove_item_claim: {
        Args: { p_session_token: string; p_bill_item_id: string };
        Returns: undefined;
      };
      get_guest_items_with_claims: {
        Args: { p_session_token: string };
        Returns: {
          id: string;
          name: string;
          quantity: number;
          unit_price_cents: number;
          total_price_cents: number;
          claimed_quantity: number;
          available_quantity: number | null;
          is_shared: boolean;
          can_claim_more: boolean;
          my_quantity: number;
          my_amount_cents: number;
          claims: Json;
        }[];
      };
      admin_claim_item: {
        Args: { p_bill_item_id: string; p_quantity?: number };
        Returns: { item_id: string; new_quantity: number }[];
      };
      admin_update_item_claim: {
        Args: { p_bill_item_id: string; p_quantity: number };
        Returns: { item_id: string; new_quantity: number }[];
      };
      get_admin_participant_id: { Args: { p_table_id: string }; Returns: string };
      get_guest_totals: {
        Args: { p_session_token: string };
        Returns: {
          participant_id: string;
          participant_name: string;
          is_me: boolean;
          total_cents: number;
        }[];
      };
      get_guest_receipt_path: {
        Args: { p_session_token: string };
        Returns: string | null;
      };
      get_guest_even_shares: {
        Args: { p_session_token: string };
        Returns: {
          participant_id: string;
          participant_name: string;
          is_me: boolean;
          share_cents: number;
        }[];
      };
      set_bill_split_mode: {
        Args: { p_bill_id: string; p_mode: 'BY_ITEM' | 'EVENLY' };
        Returns: Database['public']['Tables']['bills']['Row'];
      };
      get_guest_tip_shares: {
        Args: { p_session_token: string };
        Returns: {
          participant_id: string;
          participant_name: string;
          is_me: boolean;
          tip_share_cents: number;
        }[];
      };
      get_guest_settlements: {
        Args: { p_session_token: string };
        Returns: {
          participant_id: string;
          participant_name: string;
          is_me: boolean;
          settled: boolean;
          settled_at: string | null;
        }[];
      };
      set_participant_settled: {
        Args: { p_participant_id: string; p_settled: boolean };
        Returns: Database['public']['Tables']['participants']['Row'];
      };
      get_bill_assignment_summary: {
        Args: { p_session_token: string };
        Returns: {
          bill_id: string;
          currency: string;
          status: string;
          bill_total_cents: number;
          assigned_total_cents: number;
          remaining_total_cents: number;
          percentage_assigned: number;
        }[];
      };
      calculate_bill_subtotal: { Args: { p_bill_id: string }; Returns: number };
      calculate_bill_total: { Args: { p_bill_id: string }; Returns: number };
      bill_claimable_cents: { Args: { p_bill_id: string }; Returns: number };
      validate_bill_totals: {
        Args: { p_bill_id: string };
        Returns: { is_valid: boolean; reason: string | null }[];
      };
      bill_assigned_cents: { Args: { p_bill_id: string }; Returns: number };
      bill_remaining_cents: { Args: { p_bill_id: string }; Returns: number };
      complete_bill: {
        Args: { p_bill_id: string };
        Returns: Database['public']['Tables']['bills']['Row'];
      };
      start_bill: {
        Args: { p_bill_id: string };
        Returns: Database['public']['Tables']['bills']['Row'];
      };
      validate_bill_completion: {
        Args: { p_bill_id: string };
        Returns: { is_valid: boolean; reason: string | null }[];
      };
      generate_invite_code: { Args: { p_length?: number }; Returns: string };
      is_table_admin: { Args: { p_table_id: string }; Returns: boolean };
      is_bill_admin: { Args: { p_bill_id: string }; Returns: boolean };
      is_bill_item_admin: { Args: { p_bill_item_id: string }; Returns: boolean };
      item_assigned_cents: {
        Args: {
          p_claimed_quantity: number;
          p_quantity: number;
          p_total_price_cents: number;
          p_unit_price_cents: number;
        };
        Returns: number;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof (PublicSchema['Tables'] & PublicSchema['Views'])> =
  (PublicSchema['Tables'] & PublicSchema['Views'])[T] extends { Row: infer R } ? R : never;

export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T] extends { Insert: infer I } ? I : never;

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T] extends { Update: infer U } ? U : never;
