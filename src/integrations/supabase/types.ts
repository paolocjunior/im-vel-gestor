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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bill_installments: {
        Row: {
          account_id: string | null
          amount: number
          bill_id: string
          created_at: string
          description: string | null
          due_date: string
          id: string
          installment_number: number
          is_deleted: boolean
          paid_at: string | null
          payment_method: string | null
          status: string
          study_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          bill_id: string
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          installment_number?: number
          is_deleted?: boolean
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          study_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          bill_id?: string
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          is_deleted?: boolean
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          study_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_installments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_installments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_installments_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          account_id: string | null
          category: string | null
          cost_center: string | null
          created_at: string
          description: string
          first_due_date: string | null
          id: string
          installment_plan: string
          interval_days: number
          is_deleted: boolean
          notes: string | null
          payment_method: string | null
          study_id: string
          total_amount: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          account_id?: string | null
          category?: string | null
          cost_center?: string | null
          created_at?: string
          description: string
          first_due_date?: string | null
          id?: string
          installment_plan?: string
          interval_days?: number
          is_deleted?: boolean
          notes?: string | null
          payment_method?: string | null
          study_id: string
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          account_id?: string | null
          category?: string | null
          cost_center?: string | null
          created_at?: string
          description?: string
          first_due_date?: string | null
          id?: string
          installment_plan?: string
          interval_days?: number
          is_deleted?: boolean
          notes?: string | null
          payment_method?: string | null
          study_id?: string
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "study_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_stage_catalog: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          level: number
          name: string
          parent_id: string | null
          position: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          level?: number
          name: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          level?: number
          name?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construction_stage_catalog_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "construction_stage_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_stage_monthly_values: {
        Row: {
          created_at: string
          id: string
          month_key: string
          stage_id: string
          study_id: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          month_key: string
          stage_id: string
          study_id: string
          updated_at?: string
          value?: number
        }
        Update: {
          created_at?: string
          id?: string
          month_key?: string
          stage_id?: string
          study_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "construction_stage_monthly_values_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "construction_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_stage_monthly_values_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_stages: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          area_m2: number
          catalog_id: string | null
          code: string
          created_at: string
          dependency_id: string | null
          end_date: string | null
          id: string
          is_deleted: boolean
          level: number
          name: string
          parent_id: string | null
          position: number
          quantity: number
          stage_type: string | null
          start_date: string | null
          status: string
          study_id: string
          total_value: number
          unit_id: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          area_m2?: number
          catalog_id?: string | null
          code: string
          created_at?: string
          dependency_id?: string | null
          end_date?: string | null
          id?: string
          is_deleted?: boolean
          level?: number
          name: string
          parent_id?: string | null
          position?: number
          quantity?: number
          stage_type?: string | null
          start_date?: string | null
          status?: string
          study_id: string
          total_value?: number
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          area_m2?: number
          catalog_id?: string | null
          code?: string
          created_at?: string
          dependency_id?: string | null
          end_date?: string | null
          id?: string
          is_deleted?: boolean
          level?: number
          name?: string
          parent_id?: string | null
          position?: number
          quantity?: number
          stage_type?: string | null
          start_date?: string | null
          status?: string
          study_id?: string
          total_value?: number
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_stages_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "construction_stage_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_stages_dependency_id_fkey"
            columns: ["dependency_id"]
            isOneToOne: false
            referencedRelation: "construction_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_stages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "construction_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_stages_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_stages_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "construction_units"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_units: {
        Row: {
          abbreviation: string
          created_at: string
          has_decimals: boolean
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          abbreviation: string
          created_at?: string
          has_decimals?: boolean
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          abbreviation?: string
          created_at?: string
          has_decimals?: boolean
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          entity: string
          entity_id: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          is_deleted: boolean
          mime_type: string | null
          study_id: string
        }
        Insert: {
          created_at?: string
          entity: string
          entity_id?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          is_deleted?: boolean
          mime_type?: string | null
          study_id: string
        }
        Update: {
          created_at?: string
          entity?: string
          entity_id?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          is_deleted?: boolean
          mime_type?: string | null
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_institutions: {
        Row: {
          created_at: string
          id: string
          institution_type: string
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          institution_type?: string
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          institution_type?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          order_id: string
          quantity_ordered: number
          quantity_received: number
          unit: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          order_id: string
          quantity_ordered?: number
          quantity_received?: number
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          id: string
          is_deleted: boolean
          notes: string | null
          sent_date: string | null
          status: string
          study_id: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          sent_date?: string | null
          status?: string
          study_id: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          sent_date?: string | null
          status?: string
          study_id?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "study_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      studies: {
        Row: {
          cep: string | null
          city: string | null
          complement: string | null
          created_at: string
          id: string
          is_deleted: boolean
          name: string
          neighborhood: string | null
          notes: string | null
          state: string | null
          status: string
          street: string | null
          street_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cep?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          name: string
          neighborhood?: string | null
          notes?: string | null
          state?: string | null
          status?: string
          street?: string | null
          street_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cep?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          name?: string
          neighborhood?: string | null
          notes?: string | null
          state?: string | null
          status?: string
          street?: string | null
          street_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_computed: {
        Row: {
          acquisition_total: number
          annual_interest_rate: number
          construction_total: number
          created_at: string
          down_payment_percent: number
          exit_total: number
          financed_amount: number
          first_installment: number
          holding_total: number
          id: string
          is_official: boolean
          last_installment: number
          missing_fields: Json
          profit: number
          provider_contracts_total: number
          roi: number
          sale_net: number
          study_id: string
          total_disbursed: number
          total_interest: number
          total_invested_capital: number
          total_paid_financing: number
          updated_at: string
          viability_indicator: string
        }
        Insert: {
          acquisition_total?: number
          annual_interest_rate?: number
          construction_total?: number
          created_at?: string
          down_payment_percent?: number
          exit_total?: number
          financed_amount?: number
          first_installment?: number
          holding_total?: number
          id?: string
          is_official?: boolean
          last_installment?: number
          missing_fields?: Json
          profit?: number
          provider_contracts_total?: number
          roi?: number
          sale_net?: number
          study_id: string
          total_disbursed?: number
          total_interest?: number
          total_invested_capital?: number
          total_paid_financing?: number
          updated_at?: string
          viability_indicator?: string
        }
        Update: {
          acquisition_total?: number
          annual_interest_rate?: number
          construction_total?: number
          created_at?: string
          down_payment_percent?: number
          exit_total?: number
          financed_amount?: number
          first_installment?: number
          holding_total?: number
          id?: string
          is_official?: boolean
          last_installment?: number
          missing_fields?: Json
          profit?: number
          provider_contracts_total?: number
          roi?: number
          sale_net?: number
          study_id?: string
          total_disbursed?: number
          total_interest?: number
          total_invested_capital?: number
          total_paid_financing?: number
          updated_at?: string
          viability_indicator?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_computed_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: true
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      study_inputs: {
        Row: {
          bank_appraisal: number
          brokerage_mode: string
          brokerage_percent: number
          brokerage_value: number
          condo_fee: number
          created_at: string
          deed_fee: number
          down_payment_acquisition: number
          down_payment_value: number
          financing_enabled: boolean
          financing_system: string | null
          financing_term_months: number | null
          has_condo_fee: boolean
          id: string
          income_tax: number
          iptu_mode: string
          iptu_value: number
          itbi_mode: string
          itbi_percent: number
          itbi_value: number
          land_area_m2: number
          monthly_expenses: number
          monthly_financing_payment: number
          monthly_interest_rate: number
          months_to_sale: number | null
          payoff_at_sale: number
          price_per_m2_manual: boolean
          purchase_price_per_m2: number
          purchase_value: number
          registration_fee: number
          sale_notes: string | null
          sale_price_per_m2: number
          sale_value: number
          step_a_updated_at: string | null
          step_b_updated_at: string | null
          step_c_updated_at: string | null
          step_d_updated_at: string | null
          step_e_updated_at: string | null
          study_id: string
          total_area_m2: number
          updated_at: string
          usable_area_m2: number
        }
        Insert: {
          bank_appraisal?: number
          brokerage_mode?: string
          brokerage_percent?: number
          brokerage_value?: number
          condo_fee?: number
          created_at?: string
          deed_fee?: number
          down_payment_acquisition?: number
          down_payment_value?: number
          financing_enabled?: boolean
          financing_system?: string | null
          financing_term_months?: number | null
          has_condo_fee?: boolean
          id?: string
          income_tax?: number
          iptu_mode?: string
          iptu_value?: number
          itbi_mode?: string
          itbi_percent?: number
          itbi_value?: number
          land_area_m2?: number
          monthly_expenses?: number
          monthly_financing_payment?: number
          monthly_interest_rate?: number
          months_to_sale?: number | null
          payoff_at_sale?: number
          price_per_m2_manual?: boolean
          purchase_price_per_m2?: number
          purchase_value?: number
          registration_fee?: number
          sale_notes?: string | null
          sale_price_per_m2?: number
          sale_value?: number
          step_a_updated_at?: string | null
          step_b_updated_at?: string | null
          step_c_updated_at?: string | null
          step_d_updated_at?: string | null
          step_e_updated_at?: string | null
          study_id: string
          total_area_m2?: number
          updated_at?: string
          usable_area_m2?: number
        }
        Update: {
          bank_appraisal?: number
          brokerage_mode?: string
          brokerage_percent?: number
          brokerage_value?: number
          condo_fee?: number
          created_at?: string
          deed_fee?: number
          down_payment_acquisition?: number
          down_payment_value?: number
          financing_enabled?: boolean
          financing_system?: string | null
          financing_term_months?: number | null
          has_condo_fee?: boolean
          id?: string
          income_tax?: number
          iptu_mode?: string
          iptu_value?: number
          itbi_mode?: string
          itbi_percent?: number
          itbi_value?: number
          land_area_m2?: number
          monthly_expenses?: number
          monthly_financing_payment?: number
          monthly_interest_rate?: number
          months_to_sale?: number | null
          payoff_at_sale?: number
          price_per_m2_manual?: boolean
          purchase_price_per_m2?: number
          purchase_value?: number
          registration_fee?: number
          sale_notes?: string | null
          sale_price_per_m2?: number
          sale_value?: number
          step_a_updated_at?: string | null
          step_b_updated_at?: string | null
          step_c_updated_at?: string | null
          step_d_updated_at?: string | null
          step_e_updated_at?: string | null
          study_id?: string
          total_area_m2?: number
          updated_at?: string
          usable_area_m2?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_inputs_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      study_line_items: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string
          id: string
          is_deleted: boolean
          is_recurring: boolean
          line_type: string
          months: number | null
          notes: string | null
          percent_value: number
          single_month: number | null
          study_id: string
          updated_at: string
          value_mode: string
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          description: string
          id?: string
          is_deleted?: boolean
          is_recurring?: boolean
          line_type: string
          months?: number | null
          notes?: string | null
          percent_value?: number
          single_month?: number | null
          study_id: string
          updated_at?: string
          value_mode?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          is_deleted?: boolean
          is_recurring?: boolean
          line_type?: string
          months?: number | null
          notes?: string | null
          percent_value?: number
          single_month?: number | null
          study_id?: string
          updated_at?: string
          value_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_line_items_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      study_provider_contracts: {
        Row: {
          amount: number
          billing_model: string
          created_at: string
          details: string | null
          end_date: string | null
          id: string
          is_deleted: boolean
          provider_id: string
          service: string
          start_date: string
          status: string
          study_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_model?: string
          created_at?: string
          details?: string | null
          end_date?: string | null
          id?: string
          is_deleted?: boolean
          provider_id: string
          service: string
          start_date: string
          status?: string
          study_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_model?: string
          created_at?: string
          details?: string | null
          end_date?: string | null
          id?: string
          is_deleted?: boolean
          provider_id?: string
          service?: string
          start_date?: string
          status?: string
          study_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_provider_contracts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "study_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_provider_contracts_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      study_provider_payments: {
        Row: {
          amount: number
          contract_id: string | null
          created_at: string
          id: string
          is_deleted: boolean
          payment_date: string
          payment_method: string | null
          provider_id: string
          status: string
          study_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          contract_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          payment_date: string
          payment_method?: string | null
          provider_id: string
          status?: string
          study_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          payment_date?: string
          payment_method?: string | null
          provider_id?: string
          status?: string
          study_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_provider_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "study_provider_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_provider_payments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "study_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_provider_payments_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      study_providers: {
        Row: {
          additional_info: string | null
          bank_account: string | null
          bank_account_type: string | null
          bank_agency: string | null
          bank_holder_name: string | null
          bank_name: string | null
          bank_pix: string | null
          cep: string | null
          city: string | null
          complement: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_deleted: boolean
          neighborhood: string | null
          person_type: string
          phone: string | null
          state: string | null
          street: string | null
          street_number: string | null
          study_id: string
          updated_at: string
        }
        Insert: {
          additional_info?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_holder_name?: string | null
          bank_name?: string | null
          bank_pix?: string | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_deleted?: boolean
          neighborhood?: string | null
          person_type?: string
          phone?: string | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          study_id: string
          updated_at?: string
        }
        Update: {
          additional_info?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_holder_name?: string | null
          bank_name?: string | null
          bank_pix?: string | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_deleted?: boolean
          neighborhood?: string | null
          person_type?: string
          phone?: string | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          study_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_providers_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      study_vendors: {
        Row: {
          category: string | null
          city: string | null
          cnpj: string | null
          complement: string | null
          created_at: string
          email: string | null
          id: string
          is_deleted: boolean
          neighborhood: string | null
          nome_fantasia: string | null
          notes: string | null
          phone: string | null
          razao_social: string | null
          state: string | null
          street: string | null
          street_number: string | null
          study_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          city?: string | null
          cnpj?: string | null
          complement?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_deleted?: boolean
          neighborhood?: string | null
          nome_fantasia?: string | null
          notes?: string | null
          phone?: string | null
          razao_social?: string | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          study_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          city?: string | null
          cnpj?: string | null
          complement?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_deleted?: boolean
          neighborhood?: string | null
          nome_fantasia?: string | null
          notes?: string | null
          phone?: string | null
          razao_social?: string | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          study_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_vendors_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_categories: {
        Row: {
          cost_center_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_center_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_center_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_categories_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "user_cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cost_centers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          default_down_payment_percent: number
          default_monthly_interest: number
          default_term_months: number
          id: string
          roi_attention_threshold: number
          roi_viable_threshold: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_down_payment_percent?: number
          default_monthly_interest?: number
          default_term_months?: number
          id?: string
          roi_attention_threshold?: number
          roi_viable_threshold?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_down_payment_percent?: number
          default_monthly_interest?: number
          default_term_months?: number
          id?: string
          roi_attention_threshold?: number
          roi_viable_threshold?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      owns_order: { Args: { p_order_id: string }; Returns: boolean }
      owns_study: { Args: { p_study_id: string }; Returns: boolean }
      soft_delete_study: { Args: { p_study_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
