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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          cart_items: Json
          cart_total: number
          created_at: string | null
          email: string
          email_sent_at: string | null
          id: string
          phone: string | null
          recovered: boolean
          recovered_at: string | null
          updated_at: string | null
        }
        Insert: {
          cart_items?: Json
          cart_total?: number
          created_at?: string | null
          email: string
          email_sent_at?: string | null
          id?: string
          phone?: string | null
          recovered?: boolean
          recovered_at?: string | null
          updated_at?: string | null
        }
        Update: {
          cart_items?: Json
          cart_total?: number
          created_at?: string | null
          email?: string
          email_sent_at?: string | null
          id?: string
          phone?: string | null
          recovered?: boolean
          recovered_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          admin_user_id: string | null
          changes: Json | null
          created_at: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          ip_address: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_approval_requests: {
        Row: {
          action: string
          created_at: string
          description: string
          id: string
          proposed_data: Json | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          status: string
          target_record_id: string | null
          target_table: string
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          description: string
          id?: string
          proposed_data?: Json | null
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          status?: string
          target_record_id?: string | null
          target_table: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string
          id?: string
          proposed_data?: Json | null
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          status?: string
          target_record_id?: string | null
          target_table?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_approval_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_nav_items: {
        Row: {
          created_at: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_built: boolean | null
          label: string
          nav_key: string
          parent_key: string | null
          path: string
          requires_permission_action: string | null
          requires_permission_module: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_built?: boolean | null
          label: string
          nav_key: string
          parent_key?: string | null
          path: string
          requires_permission_action?: string | null
          requires_permission_module?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_built?: boolean | null
          label?: string
          nav_key?: string
          parent_key?: string | null
          path?: string
          requires_permission_action?: string | null
          requires_permission_module?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          admin_user_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          order_id: string | null
          target_module: string | null
          target_role: string | null
          title: string
          type: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          order_id?: string | null
          target_module?: string | null
          target_role?: string | null
          title: string
          type: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          order_id?: string | null
          target_module?: string | null
          target_role?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "admin_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "admin_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      admin_permission_definitions: {
        Row: {
          action: string
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          label: string
          module: string
        }
        Insert: {
          action: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          label: string
          module: string
        }
        Update: {
          action?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          label?: string
          module?: string
        }
        Relationships: []
      }
      admin_role_defaults: {
        Row: {
          action: string
          granted: boolean
          id: string
          module: string
          role: string
        }
        Insert: {
          action: string
          granted?: boolean
          id?: string
          module: string
          role: string
        }
        Update: {
          action?: string
          granted?: boolean
          id?: string
          module?: string
          role?: string
        }
        Relationships: []
      }
      admin_user_nav_visibility: {
        Row: {
          admin_user_id: string
          id: string
          nav_key: string
          set_at: string | null
          set_by: string | null
          visible: boolean
        }
        Insert: {
          admin_user_id: string
          id?: string
          nav_key: string
          set_at?: string | null
          set_by?: string | null
          visible?: boolean
        }
        Update: {
          admin_user_id?: string
          id?: string
          nav_key?: string
          set_at?: string | null
          set_by?: string | null
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_nav_visibility_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_nav_visibility_nav_key_fkey"
            columns: ["nav_key"]
            isOneToOne: false
            referencedRelation: "admin_nav_items"
            referencedColumns: ["nav_key"]
          },
          {
            foreignKeyName: "admin_user_nav_visibility_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_permissions: {
        Row: {
          action: string
          admin_user_id: string
          granted: boolean
          granted_at: string | null
          granted_by: string | null
          id: string
          module: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          granted?: boolean
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          module: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          granted?: boolean
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          module?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_permissions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string | null
          custom_permissions: Json | null
          display_name: string
          email: string
          id: string
          is_active: boolean | null
          last_login_at: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string | null
          custom_permissions?: Json | null
          display_name: string
          email: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string | null
          custom_permissions?: Json | null
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string | null
          device_type: string | null
          event_data: Json | null
          event_type: string
          id: string
          ip_address: string | null
          os: string | null
          page_url: string | null
          referral_source: string | null
          referrer: string | null
          session_id: string | null
          traffic_medium: string | null
          traffic_source: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          os?: string | null
          page_url?: string | null
          referral_source?: string | null
          referrer?: string | null
          session_id?: string | null
          traffic_medium?: string | null
          traffic_source?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          os?: string | null
          page_url?: string | null
          referral_source?: string | null
          referrer?: string | null
          session_id?: string | null
          traffic_medium?: string | null
          traffic_source?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          bg_color: string | null
          created_at: string | null
          display_order: number | null
          display_type: string
          emoji: string | null
          ends_at: string | null
          id: string
          is_active: boolean | null
          link_text: string | null
          link_url: string | null
          linked_coupon_code: string | null
          linked_product_id: string | null
          message: string
          popup_delay_seconds: number | null
          popup_frequency: string | null
          priority: number | null
          show_on_exit_intent: boolean | null
          starts_at: string | null
          target_audience: string | null
          target_pages: string[] | null
          text_color: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          bg_color?: string | null
          created_at?: string | null
          display_order?: number | null
          display_type?: string
          emoji?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          link_text?: string | null
          link_url?: string | null
          linked_coupon_code?: string | null
          linked_product_id?: string | null
          message: string
          popup_delay_seconds?: number | null
          popup_frequency?: string | null
          priority?: number | null
          show_on_exit_intent?: boolean | null
          starts_at?: string | null
          target_audience?: string | null
          target_pages?: string[] | null
          text_color?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          bg_color?: string | null
          created_at?: string | null
          display_order?: number | null
          display_type?: string
          emoji?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          link_text?: string | null
          link_url?: string | null
          linked_coupon_code?: string | null
          linked_product_id?: string | null
          message?: string
          popup_delay_seconds?: number | null
          popup_frequency?: string | null
          priority?: number | null
          show_on_exit_intent?: boolean | null
          starts_at?: string | null
          target_audience?: string | null
          target_pages?: string[] | null
          text_color?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_linked_product_id_fkey"
            columns: ["linked_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author: string | null
          body: string
          cover_image_url: string | null
          created_at: string | null
          deleted_at: string | null
          excerpt: string | null
          id: string
          is_published: boolean | null
          meta_description: string | null
          meta_title: string | null
          og_image_url: string | null
          published_at: string | null
          scheduled_for: string | null
          slug: string
          title: string
          updated_at: string | null
        }
        Insert: {
          author?: string | null
          body: string
          cover_image_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          is_published?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          slug: string
          title: string
          updated_at?: string | null
        }
        Update: {
          author?: string | null
          body?: string
          cover_image_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          is_published?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          slug?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          brand_name: string
          cogs_percent: number | null
          compare_at_price: number | null
          cost_price: number | null
          created_at: string | null
          diaper_type: string | null
          display_order: number | null
          id: string
          image_url: string | null
          images: string[] | null
          in_stock: boolean | null
          is_active: boolean
          is_default_for_tier: boolean | null
          logo_url: string | null
          low_stock_threshold: number | null
          pack_count: number | null
          price: number
          product_id: string
          reserved_quantity: number | null
          size_variant: string | null
          sku: string | null
          stock_quantity: number | null
          thumbnail_url: string | null
          tier: string
          updated_at: string
          variant_type: string | null
          vendor_id: string | null
          weight_kg: number | null
          weight_range_kg: string | null
        }
        Insert: {
          brand_name: string
          cogs_percent?: number | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string | null
          diaper_type?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          in_stock?: boolean | null
          is_active?: boolean
          is_default_for_tier?: boolean | null
          logo_url?: string | null
          low_stock_threshold?: number | null
          pack_count?: number | null
          price: number
          product_id: string
          reserved_quantity?: number | null
          size_variant?: string | null
          sku?: string | null
          stock_quantity?: number | null
          thumbnail_url?: string | null
          tier: string
          updated_at?: string
          variant_type?: string | null
          vendor_id?: string | null
          weight_kg?: number | null
          weight_range_kg?: string | null
        }
        Update: {
          brand_name?: string
          cogs_percent?: number | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string | null
          diaper_type?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          in_stock?: boolean | null
          is_active?: boolean
          is_default_for_tier?: boolean | null
          logo_url?: string | null
          low_stock_threshold?: number | null
          pack_count?: number | null
          price?: number
          product_id?: string
          reserved_quantity?: number | null
          size_variant?: string | null
          sku?: string | null
          stock_quantity?: number | null
          thumbnail_url?: string | null
          tier?: string
          updated_at?: string
          variant_type?: string | null
          vendor_id?: string | null
          weight_kg?: number | null
          weight_range_kg?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_items: {
        Row: {
          brand_id: string | null
          bundle_id: string
          display_order: number | null
          id: string
          product_id: string
          quantity: number | null
          section: string | null
        }
        Insert: {
          brand_id?: string | null
          bundle_id: string
          display_order?: number | null
          id?: string
          product_id: string
          quantity?: number | null
          section?: string | null
        }
        Update: {
          brand_id?: string | null
          bundle_id?: string
          display_order?: number | null
          id?: string
          product_id?: string
          quantity?: number | null
          section?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bundle_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          delivery_method: string | null
          description: string | null
          discount_percent: number | null
          display_order: number | null
          emoji: string | null
          hospital_type: string
          id: string
          image_url: string | null
          is_active: boolean | null
          item_count: number
          meta_description: string | null
          meta_title: string | null
          name: string
          og_image_url: string | null
          price: number
          price_mode: string | null
          slug: string
          tier: string
          updated_at: string | null
          upsell_bundle_id: string | null
          upsell_text: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          delivery_method?: string | null
          description?: string | null
          discount_percent?: number | null
          display_order?: number | null
          emoji?: string | null
          hospital_type: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          item_count: number
          meta_description?: string | null
          meta_title?: string | null
          name: string
          og_image_url?: string | null
          price: number
          price_mode?: string | null
          slug: string
          tier: string
          updated_at?: string | null
          upsell_bundle_id?: string | null
          upsell_text?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          delivery_method?: string | null
          description?: string | null
          discount_percent?: number | null
          display_order?: number | null
          emoji?: string | null
          hospital_type?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          item_count?: number
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          og_image_url?: string | null
          price?: number
          price_mode?: string | null
          slug?: string
          tier?: string
          updated_at?: string | null
          upsell_bundle_id?: string | null
          upsell_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bundles_upsell_bundle_id_fkey"
            columns: ["upsell_bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      coming_soon_waitlist: {
        Row: {
          created_at: string | null
          id: string
          whatsapp_number: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          whatsapp_number: string
        }
        Update: {
          created_at?: string | null
          id?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      coupon_usage: {
        Row: {
          coupon_id: string | null
          created_at: string | null
          customer_email: string
          discount_applied: number
          id: string
          order_id: string | null
        }
        Insert: {
          coupon_id?: string | null
          created_at?: string | null
          customer_email: string
          discount_applied: number
          id?: string
          order_id?: string | null
        }
        Update: {
          coupon_id?: string | null
          created_at?: string | null
          customer_email?: string
          discount_applied?: number
          id?: string
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usage_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      coupons: {
        Row: {
          applicable_ids: string[] | null
          applies_to: string | null
          code: string
          created_at: string | null
          description: string | null
          discount_type: string
          discount_value: number | null
          end_date: string | null
          id: string
          is_active: boolean | null
          maximum_discount_amount: number | null
          minimum_order_amount: number | null
          start_date: string | null
          updated_at: string | null
          usage_count: number | null
          usage_limit: number | null
          usage_limit_per_customer: number | null
        }
        Insert: {
          applicable_ids?: string[] | null
          applies_to?: string | null
          code: string
          created_at?: string | null
          description?: string | null
          discount_type: string
          discount_value?: number | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          maximum_discount_amount?: number | null
          minimum_order_amount?: number | null
          start_date?: string | null
          updated_at?: string | null
          usage_count?: number | null
          usage_limit?: number | null
          usage_limit_per_customer?: number | null
        }
        Update: {
          applicable_ids?: string[] | null
          applies_to?: string | null
          code?: string
          created_at?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          maximum_discount_amount?: number | null
          minimum_order_amount?: number | null
          start_date?: string | null
          updated_at?: string | null
          usage_count?: number | null
          usage_limit?: number | null
          usage_limit_per_customer?: number | null
        }
        Relationships: []
      }
      courier_interstate_rates: {
        Row: {
          courier_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          markup_pct: number
          partner_cost: number
          updated_at: string | null
          weight_kg_max: number
          weight_limit_per_booking_kg: number | null
          weight_rounding: string | null
          zone_id: string
        }
        Insert: {
          courier_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          markup_pct?: number
          partner_cost: number
          updated_at?: string | null
          weight_kg_max: number
          weight_limit_per_booking_kg?: number | null
          weight_rounding?: string | null
          zone_id: string
        }
        Update: {
          courier_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          markup_pct?: number
          partner_cost?: number
          updated_at?: string | null
          weight_kg_max?: number
          weight_limit_per_booking_kg?: number | null
          weight_rounding?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_interstate_rates_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_interstate_rates_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_rate_cards: {
        Row: {
          applies_on_days: string[] | null
          bulk_min_orders: number | null
          courier_id: string
          created_at: string | null
          customer_rate_override: number | null
          id: string
          is_active: boolean | null
          markup_pct: number
          notes: string | null
          partner_cost: number
          rate_type: string
          updated_at: string | null
          weight_limit_kg: number | null
          weight_rounding: string | null
          zone_id: string
        }
        Insert: {
          applies_on_days?: string[] | null
          bulk_min_orders?: number | null
          courier_id: string
          created_at?: string | null
          customer_rate_override?: number | null
          id?: string
          is_active?: boolean | null
          markup_pct?: number
          notes?: string | null
          partner_cost?: number
          rate_type: string
          updated_at?: string | null
          weight_limit_kg?: number | null
          weight_rounding?: string | null
          zone_id: string
        }
        Update: {
          applies_on_days?: string[] | null
          bulk_min_orders?: number | null
          courier_id?: string
          created_at?: string | null
          customer_rate_override?: number | null
          id?: string
          is_active?: boolean | null
          markup_pct?: number
          notes?: string | null
          partner_cost?: number
          rate_type?: string
          updated_at?: string | null
          weight_limit_kg?: number | null
          weight_rounding?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_rate_cards_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_rate_cards_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_routing_rules: {
        Row: {
          bulk_order_threshold: number | null
          bulk_window_hours: number | null
          created_at: string | null
          fallback_courier_id: string | null
          id: string
          interstate_courier_id: string | null
          is_active: boolean | null
          notes: string | null
          preferred_courier_id: string | null
          rule_name: string
          strategy: string
          undeliverable_areas: string[] | null
          updated_at: string | null
        }
        Insert: {
          bulk_order_threshold?: number | null
          bulk_window_hours?: number | null
          created_at?: string | null
          fallback_courier_id?: string | null
          id?: string
          interstate_courier_id?: string | null
          is_active?: boolean | null
          notes?: string | null
          preferred_courier_id?: string | null
          rule_name?: string
          strategy?: string
          undeliverable_areas?: string[] | null
          updated_at?: string | null
        }
        Update: {
          bulk_order_threshold?: number | null
          bulk_window_hours?: number | null
          created_at?: string | null
          fallback_courier_id?: string | null
          id?: string
          interstate_courier_id?: string | null
          is_active?: boolean | null
          notes?: string | null
          preferred_courier_id?: string | null
          rule_name?: string
          strategy?: string
          undeliverable_areas?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_routing_rules_fallback_courier_id_fkey"
            columns: ["fallback_courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_routing_rules_interstate_courier_id_fkey"
            columns: ["interstate_courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_routing_rules_preferred_courier_id_fkey"
            columns: ["preferred_courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_zone_assignments: {
        Row: {
          condition_type: string
          condition_value: Json | null
          courier_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          priority: number
          zone_id: string
        }
        Insert: {
          condition_type?: string
          condition_value?: Json | null
          courier_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          priority?: number
          zone_id: string
        }
        Update: {
          condition_type?: string
          condition_value?: Json | null
          courier_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          priority?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_zone_assignments_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_zone_assignments_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          coverage: string[] | null
          created_at: string | null
          display_order: number | null
          excluded_areas: string[] | null
          express_available: boolean | null
          express_surcharge: number | null
          id: string
          is_active: boolean | null
          name: string
          pricing_model: string | null
          special_notes: string | null
          subscription_plans: Json | null
          updated_at: string | null
          website: string | null
          weight_limit_kg: number | null
          weight_rounding: string | null
          working_days: string | null
          working_hours: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          coverage?: string[] | null
          created_at?: string | null
          display_order?: number | null
          excluded_areas?: string[] | null
          express_available?: boolean | null
          express_surcharge?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          pricing_model?: string | null
          special_notes?: string | null
          subscription_plans?: Json | null
          updated_at?: string | null
          website?: string | null
          weight_limit_kg?: number | null
          weight_rounding?: string | null
          working_days?: string | null
          working_hours?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          coverage?: string[] | null
          created_at?: string | null
          display_order?: number | null
          excluded_areas?: string[] | null
          express_available?: boolean | null
          express_surcharge?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          pricing_model?: string | null
          special_notes?: string | null
          subscription_plans?: Json | null
          updated_at?: string | null
          website?: string | null
          weight_limit_kg?: number | null
          weight_rounding?: string | null
          working_days?: string | null
          working_hours?: string | null
        }
        Relationships: []
      }
      cross_sell_rules: {
        Row: {
          created_at: string | null
          display_order: number | null
          heading: string | null
          id: string
          is_active: boolean | null
          max_items: number | null
          product_category: string | null
          product_ids: string[] | null
          rule_name: string
          trigger_type: string
          trigger_value: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          heading?: string | null
          id?: string
          is_active?: boolean | null
          max_items?: number | null
          product_category?: string | null
          product_ids?: string[] | null
          rule_name: string
          trigger_type?: string
          trigger_value?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          heading?: string | null
          id?: string
          is_active?: boolean | null
          max_items?: number | null
          product_category?: string | null
          product_ids?: string[] | null
          rule_name?: string
          trigger_type?: string
          trigger_value?: string | null
        }
        Relationships: []
      }
      custom_reports: {
        Row: {
          comparison_enabled: boolean | null
          comparison_type: string | null
          created_at: string | null
          created_by: string | null
          date_range_type: string | null
          description: string | null
          dimensions: Json
          filters: Json | null
          id: string
          is_pinned: boolean | null
          is_shared: boolean | null
          last_run_at: string | null
          metrics: Json
          name: string
          report_type: string | null
          sort_by: string | null
          sort_direction: string | null
          updated_at: string | null
        }
        Insert: {
          comparison_enabled?: boolean | null
          comparison_type?: string | null
          created_at?: string | null
          created_by?: string | null
          date_range_type?: string | null
          description?: string | null
          dimensions?: Json
          filters?: Json | null
          id?: string
          is_pinned?: boolean | null
          is_shared?: boolean | null
          last_run_at?: string | null
          metrics?: Json
          name: string
          report_type?: string | null
          sort_by?: string | null
          sort_direction?: string | null
          updated_at?: string | null
        }
        Update: {
          comparison_enabled?: boolean | null
          comparison_type?: string | null
          created_at?: string | null
          created_by?: string | null
          date_range_type?: string | null
          description?: string | null
          dimensions?: Json
          filters?: Json | null
          id?: string
          is_pinned?: boolean | null
          is_shared?: boolean | null
          last_run_at?: string | null
          metrics?: Json
          name?: string
          report_type?: string | null
          sort_by?: string | null
          sort_direction?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address: string
          city: string
          created_at: string | null
          customer_id: string
          delivery_notes: string | null
          id: string
          is_default: boolean | null
          label: string | null
          phone: string | null
          recipient_name: string | null
          state: string
          updated_at: string | null
        }
        Insert: {
          address: string
          city: string
          created_at?: string | null
          customer_id: string
          delivery_notes?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          phone?: string | null
          recipient_name?: string | null
          state: string
          updated_at?: string | null
        }
        Update: {
          address?: string
          city?: string
          created_at?: string | null
          customer_id?: string
          delivery_notes?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          phone?: string | null
          recipient_name?: string | null
          state?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_account_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          account_created_at: string | null
          acquisition_channel: string | null
          auth_user_id: string | null
          created_at: string | null
          customer_ref: string | null
          delivery_address: string | null
          delivery_area: string | null
          delivery_state: string | null
          email: string
          email_verified: boolean | null
          first_purchase_date: string | null
          full_name: string | null
          id: string
          last_login_at: string | null
          last_order_at: string | null
          last_purchase_date: string | null
          notes: string | null
          phone: string | null
          primary_country: string | null
          primary_device: string | null
          tags: string[] | null
          total_orders: number | null
          total_spent: number | null
          updated_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
          account_created_at?: string | null
          acquisition_channel?: string | null
          auth_user_id?: string | null
          created_at?: string | null
          customer_ref?: string | null
          delivery_address?: string | null
          delivery_area?: string | null
          delivery_state?: string | null
          email: string
          email_verified?: boolean | null
          first_purchase_date?: string | null
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          last_order_at?: string | null
          last_purchase_date?: string | null
          notes?: string | null
          phone?: string | null
          primary_country?: string | null
          primary_device?: string | null
          tags?: string[] | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          account_created_at?: string | null
          acquisition_channel?: string | null
          auth_user_id?: string | null
          created_at?: string | null
          customer_ref?: string | null
          delivery_address?: string | null
          delivery_area?: string | null
          delivery_state?: string | null
          email?: string
          email_verified?: boolean | null
          first_purchase_date?: string | null
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          last_order_at?: string | null
          last_purchase_date?: string | null
          notes?: string | null
          phone?: string | null
          primary_country?: string | null
          primary_device?: string | null
          tags?: string[] | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      deliverable_states: {
        Row: {
          created_at: string | null
          display_order: number | null
          has_zones: boolean | null
          id: string
          is_active: boolean | null
          is_express_only: boolean
          name: string
          note: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          has_zones?: boolean | null
          id?: string
          is_active?: boolean | null
          is_express_only?: boolean
          name: string
          note?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          has_zones?: boolean | null
          id?: string
          is_active?: boolean | null
          is_express_only?: boolean
          name?: string
          note?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      delivery_settings: {
        Row: {
          cities: string[] | null
          created_at: string | null
          delivery_days_max: number
          delivery_days_min: number
          delivery_fee: number
          display_order: number | null
          free_delivery_threshold: number | null
          id: string
          is_active: boolean | null
          states: string[] | null
          zone_name: string
        }
        Insert: {
          cities?: string[] | null
          created_at?: string | null
          delivery_days_max: number
          delivery_days_min: number
          delivery_fee: number
          display_order?: number | null
          free_delivery_threshold?: number | null
          id?: string
          is_active?: boolean | null
          states?: string[] | null
          zone_name: string
        }
        Update: {
          cities?: string[] | null
          created_at?: string | null
          delivery_days_max?: number
          delivery_days_min?: number
          delivery_fee?: number
          display_order?: number | null
          free_delivery_threshold?: number | null
          id?: string
          is_active?: boolean | null
          states?: string[] | null
          zone_name?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          order_id: string | null
          recipient_email: string
          resend_email_id: string | null
          return_id: string | null
          send_to_type: string
          status: string
          subject: string
          template_slug: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          recipient_email: string
          resend_email_id?: string | null
          return_id?: string | null
          send_to_type: string
          status: string
          subject: string
          template_slug: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          recipient_email?: string
          resend_email_id?: string | null
          return_id?: string | null
          send_to_type?: string
          status?: string
          subject?: string
          template_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "email_send_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "email_send_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "email_send_log_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "admin_returns_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_log_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "order_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_log_template_slug_fkey"
            columns: ["template_slug"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["slug"]
          },
        ]
      }
      email_templates: {
        Row: {
          created_at: string | null
          delay_hours: number | null
          description: string | null
          email_provider: string
          html_body: string
          id: string
          is_active: boolean | null
          last_sent_at: string | null
          name: string
          schedule_description: string | null
          send_count: number | null
          slug: string
          subject: string
          trigger_description: string | null
          trigger_event: string | null
          trigger_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delay_hours?: number | null
          description?: string | null
          email_provider?: string
          html_body: string
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          name: string
          schedule_description?: string | null
          send_count?: number | null
          slug: string
          subject: string
          trigger_description?: string | null
          trigger_event?: string | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delay_hours?: number | null
          description?: string | null
          email_provider?: string
          html_body?: string
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          name?: string
          schedule_description?: string | null
          send_count?: number | null
          slug?: string
          subject?: string
          trigger_description?: string | null
          trigger_event?: string | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      faq_items: {
        Row: {
          answer: string
          category: string | null
          created_at: string | null
          deleted_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          question: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string | null
          deleted_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          question: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string | null
          deleted_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          question?: string
        }
        Relationships: []
      }
      finance_assets: {
        Row: {
          annual_depreciation: number | null
          asset_name: string
          asset_type: string
          created_at: string | null
          depreciation_method: string | null
          id: string
          is_active: boolean | null
          monthly_depreciation: number | null
          notes: string | null
          purchase_cost: number
          purchase_date: string
          residual_value: number | null
          useful_life_years: number
        }
        Insert: {
          annual_depreciation?: number | null
          asset_name: string
          asset_type: string
          created_at?: string | null
          depreciation_method?: string | null
          id?: string
          is_active?: boolean | null
          monthly_depreciation?: number | null
          notes?: string | null
          purchase_cost: number
          purchase_date: string
          residual_value?: number | null
          useful_life_years?: number
        }
        Update: {
          annual_depreciation?: number | null
          asset_name?: string
          asset_type?: string
          created_at?: string | null
          depreciation_method?: string | null
          id?: string
          is_active?: boolean | null
          monthly_depreciation?: number | null
          notes?: string | null
          purchase_cost?: number
          purchase_date?: string
          residual_value?: number | null
          useful_life_years?: number
        }
        Relationships: []
      }
      finance_cogs: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          period_month: number | null
          period_year: number | null
          product_id: string | null
          product_name: string
          purchase_date: string
          quantity: number
          supplier: string | null
          total_cost: number | null
          unit_cost: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          period_month?: number | null
          period_year?: number | null
          product_id?: string | null
          product_name: string
          purchase_date: string
          quantity?: number
          supplier?: string | null
          total_cost?: number | null
          unit_cost: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          period_month?: number | null
          period_year?: number | null
          product_id?: string | null
          product_name?: string
          purchase_date?: string
          quantity?: number
          supplier?: string | null
          total_cost?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_cogs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_compliance_deadlines: {
        Row: {
          created_at: string | null
          description: string | null
          due_date: string
          filed_at: string | null
          filed_by: string | null
          id: string
          is_recurring: boolean | null
          name: string
          notes: string | null
          penalty_description: string | null
          recurrence_months: number | null
          regulatory_body: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          due_date: string
          filed_at?: string | null
          filed_by?: string | null
          id?: string
          is_recurring?: boolean | null
          name: string
          notes?: string | null
          penalty_description?: string | null
          recurrence_months?: number | null
          regulatory_body: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          due_date?: string
          filed_at?: string | null
          filed_by?: string | null
          id?: string
          is_recurring?: boolean | null
          name?: string
          notes?: string | null
          penalty_description?: string | null
          recurrence_months?: number | null
          regulatory_body?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_compliance_deadlines_filed_by_fkey"
            columns: ["filed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_expense_categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          type?: string
        }
        Relationships: []
      }
      finance_expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string | null
          created_by: string | null
          description: string
          expense_date: string
          id: string
          is_auto_generated: boolean
          is_recurring: boolean | null
          last_generated_at: string | null
          notes: string | null
          period_month: number | null
          period_year: number | null
          receipt_url: string | null
          recurrence: string | null
          recurrence_end_date: string | null
          recurrence_interval: number | null
          recurrence_next_date: string | null
          recurrence_parent_id: string | null
          recurrence_unit: string | null
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          expense_date: string
          id?: string
          is_auto_generated?: boolean
          is_recurring?: boolean | null
          last_generated_at?: string | null
          notes?: string | null
          period_month?: number | null
          period_year?: number | null
          receipt_url?: string | null
          recurrence?: string | null
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_next_date?: string | null
          recurrence_parent_id?: string | null
          recurrence_unit?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          expense_date?: string
          id?: string
          is_auto_generated?: boolean
          is_recurring?: boolean | null
          last_generated_at?: string | null
          notes?: string | null
          period_month?: number | null
          period_year?: number | null
          receipt_url?: string | null
          recurrence?: string | null
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_next_date?: string | null
          recurrence_parent_id?: string | null
          recurrence_unit?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expenses_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "finance_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_payroll: {
        Row: {
          basic_salary: number
          created_at: string | null
          created_by: string | null
          employee_name: string
          employee_pension: number | null
          employer_pension: number | null
          gross_salary: number
          housing_allowance: number | null
          id: string
          itf: number | null
          net_salary: number | null
          nhf_deduction: number | null
          notes: string | null
          nsitf: number | null
          other_allowances: number | null
          pay_month: number
          pay_year: number
          paye_tax: number | null
          role: string | null
          total_employee_deductions: number | null
          total_employer_cost: number | null
          transport_allowance: number | null
        }
        Insert: {
          basic_salary: number
          created_at?: string | null
          created_by?: string | null
          employee_name: string
          employee_pension?: number | null
          employer_pension?: number | null
          gross_salary?: number
          housing_allowance?: number | null
          id?: string
          itf?: number | null
          net_salary?: number | null
          nhf_deduction?: number | null
          notes?: string | null
          nsitf?: number | null
          other_allowances?: number | null
          pay_month: number
          pay_year: number
          paye_tax?: number | null
          role?: string | null
          total_employee_deductions?: number | null
          total_employer_cost?: number | null
          transport_allowance?: number | null
        }
        Update: {
          basic_salary?: number
          created_at?: string | null
          created_by?: string | null
          employee_name?: string
          employee_pension?: number | null
          employer_pension?: number | null
          gross_salary?: number
          housing_allowance?: number | null
          id?: string
          itf?: number | null
          net_salary?: number | null
          nhf_deduction?: number | null
          notes?: string | null
          nsitf?: number | null
          other_allowances?: number | null
          pay_month?: number
          pay_year?: number
          paye_tax?: number | null
          role?: string | null
          total_employee_deductions?: number | null
          total_employer_cost?: number | null
          transport_allowance?: number | null
        }
        Relationships: []
      }
      finance_periods: {
        Row: {
          cogs_target: number | null
          created_at: string | null
          id: string
          is_closed: boolean | null
          notes: string | null
          opex_target: number | null
          period_month: number | null
          period_type: string
          period_year: number
          revenue_target: number | null
        }
        Insert: {
          cogs_target?: number | null
          created_at?: string | null
          id?: string
          is_closed?: boolean | null
          notes?: string | null
          opex_target?: number | null
          period_month?: number | null
          period_type?: string
          period_year: number
          revenue_target?: number | null
        }
        Update: {
          cogs_target?: number | null
          created_at?: string | null
          id?: string
          is_closed?: boolean | null
          notes?: string | null
          opex_target?: number | null
          period_month?: number | null
          period_type?: string
          period_year?: number
          revenue_target?: number | null
        }
        Relationships: []
      }
      finance_tax_settings: {
        Row: {
          annual_turnover_threshold: number | null
          cit_rate: number | null
          company_size: string
          created_at: string | null
          development_levy_rate: number | null
          employee_pension_rate: number | null
          employer_pension_rate: number | null
          fiscal_year: number
          id: string
          itf_rate: number | null
          nhf_rate: number | null
          nsitf_rate: number | null
          paye_bands: Json | null
          updated_at: string | null
          vat_rate: number | null
          vat_registered: boolean | null
          wht_rate_goods: number | null
          wht_rate_services: number | null
        }
        Insert: {
          annual_turnover_threshold?: number | null
          cit_rate?: number | null
          company_size?: string
          created_at?: string | null
          development_levy_rate?: number | null
          employee_pension_rate?: number | null
          employer_pension_rate?: number | null
          fiscal_year: number
          id?: string
          itf_rate?: number | null
          nhf_rate?: number | null
          nsitf_rate?: number | null
          paye_bands?: Json | null
          updated_at?: string | null
          vat_rate?: number | null
          vat_registered?: boolean | null
          wht_rate_goods?: number | null
          wht_rate_services?: number | null
        }
        Update: {
          annual_turnover_threshold?: number | null
          cit_rate?: number | null
          company_size?: string
          created_at?: string | null
          development_levy_rate?: number | null
          employee_pension_rate?: number | null
          employer_pension_rate?: number | null
          fiscal_year?: number
          id?: string
          itf_rate?: number | null
          nhf_rate?: number | null
          nsitf_rate?: number | null
          paye_bands?: Json | null
          updated_at?: string | null
          vat_rate?: number | null
          vat_registered?: boolean | null
          wht_rate_goods?: number | null
          wht_rate_services?: number | null
        }
        Relationships: []
      }
      free_delivery_thresholds: {
        Row: {
          applicable_states: string[] | null
          banner_display_threshold_pct: number | null
          created_at: string | null
          customer_pays_fee: number
          delivery_label: string
          display_order: number | null
          helper_text: string | null
          id: string
          is_active: boolean | null
          marketing_copy: string | null
          name: string
          progress_template: string | null
          scope: string
          threshold_amount: number
          updated_at: string | null
        }
        Insert: {
          applicable_states?: string[] | null
          banner_display_threshold_pct?: number | null
          created_at?: string | null
          customer_pays_fee?: number
          delivery_label: string
          display_order?: number | null
          helper_text?: string | null
          id?: string
          is_active?: boolean | null
          marketing_copy?: string | null
          name: string
          progress_template?: string | null
          scope: string
          threshold_amount: number
          updated_at?: string | null
        }
        Update: {
          applicable_states?: string[] | null
          banner_display_threshold_pct?: number | null
          created_at?: string | null
          customer_pays_fee?: number
          delivery_label?: string
          display_order?: number | null
          helper_text?: string | null
          id?: string
          is_active?: boolean | null
          marketing_copy?: string | null
          name?: string
          progress_template?: string | null
          scope?: string
          threshold_amount?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      gift_box_items: {
        Row: {
          brand_id: string | null
          created_at: string
          display_order: number
          gift_box_id: string
          id: string
          is_enabled: boolean
          is_optional: boolean
          product_id: string
          quantity: number
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          display_order?: number
          gift_box_id: string
          id?: string
          is_enabled?: boolean
          is_optional?: boolean
          product_id: string
          quantity?: number
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          display_order?: number
          gift_box_id?: string
          id?: string
          is_enabled?: boolean
          is_optional?: boolean
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_box_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_box_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_box_items_gift_box_id_fkey"
            columns: ["gift_box_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_box_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      health_check_log: {
        Row: {
          email_sent: boolean
          id: string
          issues_found: number
          results: Json
          run_at: string
          severity: string
          total_checks: number
        }
        Insert: {
          email_sent?: boolean
          id?: string
          issues_found?: number
          results?: Json
          run_at?: string
          severity?: string
          total_checks?: number
        }
        Update: {
          email_sent?: boolean
          id?: string
          issues_found?: number
          results?: Json
          run_at?: string
          severity?: string
          total_checks?: number
        }
        Relationships: []
      }
      homepage_sections: {
        Row: {
          created_at: string | null
          custom_data: Json | null
          display_order: number | null
          id: string
          is_visible: boolean | null
          section_key: string
          section_label: string
          settings: Json | null
          subtitle: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_data?: Json | null
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          section_key: string
          section_label: string
          settings?: Json | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_data?: Json | null
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          section_key?: string
          section_label?: string
          settings?: Json | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      how_it_works_steps: {
        Row: {
          created_at: string | null
          description: string
          display_order: number | null
          icon: string
          id: string
          is_active: boolean | null
          step_number: number
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          display_order?: number | null
          icon?: string
          id?: string
          is_active?: boolean | null
          step_number: number
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          display_order?: number | null
          icon?: string
          id?: string
          is_active?: boolean | null
          step_number?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      hr_departments: {
        Row: {
          created_at: string | null
          description: string | null
          head_employee_id: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          head_employee_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          head_employee_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_departments_head_employee_id_fkey"
            columns: ["head_employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_departments_head_employee_id_fkey"
            columns: ["head_employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_documents: {
        Row: {
          created_at: string | null
          document_type: string
          employee_id: string
          file_url: string | null
          id: string
          notes: string | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          document_type: string
          employee_id: string
          file_url?: string | null
          id?: string
          notes?: string | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          document_type?: string
          employee_id?: string
          file_url?: string | null
          id?: string
          notes?: string | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employees: {
        Row: {
          address: string | null
          auth_user_id: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          basic_salary: number
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          department_id: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          employee_id: string
          employment_type: string
          end_date: string | null
          full_name: string
          gender: string | null
          housing_allowance: number
          id: string
          job_title: string
          line_manager_id: string | null
          national_id_number: string | null
          notes: string | null
          other_allowances: number
          personal_email: string
          phone: string | null
          probation_end_date: string | null
          start_date: string
          state_of_origin: string | null
          status: string
          termination_reason: string | null
          transport_allowance: number
          updated_at: string | null
          whatsapp_number: string | null
          work_email: string | null
        }
        Insert: {
          address?: string | null
          auth_user_id?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          basic_salary?: number
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          department_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employee_id?: string
          employment_type?: string
          end_date?: string | null
          full_name: string
          gender?: string | null
          housing_allowance?: number
          id?: string
          job_title: string
          line_manager_id?: string | null
          national_id_number?: string | null
          notes?: string | null
          other_allowances?: number
          personal_email: string
          phone?: string | null
          probation_end_date?: string | null
          start_date: string
          state_of_origin?: string | null
          status?: string
          termination_reason?: string | null
          transport_allowance?: number
          updated_at?: string | null
          whatsapp_number?: string | null
          work_email?: string | null
        }
        Update: {
          address?: string | null
          auth_user_id?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          basic_salary?: number
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          department_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employee_id?: string
          employment_type?: string
          end_date?: string | null
          full_name?: string
          gender?: string | null
          housing_allowance?: number
          id?: string
          job_title?: string
          line_manager_id?: string | null
          national_id_number?: string | null
          notes?: string | null
          other_allowances?: number
          personal_email?: string
          phone?: string | null
          probation_end_date?: string | null
          start_date?: string
          state_of_origin?: string | null
          status?: string
          termination_reason?: string | null
          transport_allowance?: number
          updated_at?: string | null
          whatsapp_number?: string | null
          work_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_line_manager_id_fkey"
            columns: ["line_manager_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_employees_line_manager_id_fkey"
            columns: ["line_manager_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_job_history: {
        Row: {
          change_type: string
          created_at: string | null
          effective_date: string
          employee_id: string
          id: string
          new_basic_salary: number | null
          new_department_id: string | null
          new_employment_type: string | null
          new_job_title: string | null
          new_status: string | null
          notes: string | null
          previous_basic_salary: number | null
          previous_department_id: string | null
          previous_employment_type: string | null
          previous_job_title: string | null
          previous_status: string | null
          reason: string | null
          recorded_by: string | null
        }
        Insert: {
          change_type: string
          created_at?: string | null
          effective_date?: string
          employee_id: string
          id?: string
          new_basic_salary?: number | null
          new_department_id?: string | null
          new_employment_type?: string | null
          new_job_title?: string | null
          new_status?: string | null
          notes?: string | null
          previous_basic_salary?: number | null
          previous_department_id?: string | null
          previous_employment_type?: string | null
          previous_job_title?: string | null
          previous_status?: string | null
          reason?: string | null
          recorded_by?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string | null
          effective_date?: string
          employee_id?: string
          id?: string
          new_basic_salary?: number | null
          new_department_id?: string | null
          new_employment_type?: string | null
          new_job_title?: string | null
          new_status?: string | null
          notes?: string | null
          previous_basic_salary?: number | null
          previous_department_id?: string | null
          previous_employment_type?: string | null
          previous_job_title?: string | null
          previous_status?: string | null
          reason?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_job_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_job_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_history_new_department_id_fkey"
            columns: ["new_department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_history_previous_department_id_fkey"
            columns: ["previous_department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_history_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_balances: {
        Row: {
          created_at: string | null
          employee_id: string
          entitled_days: number
          id: string
          leave_type_id: string
          pending_days: number
          updated_at: string | null
          used_days: number
          year: number
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          entitled_days?: number
          id?: string
          leave_type_id: string
          pending_days?: number
          updated_at?: string | null
          used_days?: number
          year: number
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          entitled_days?: number
          id?: string
          leave_type_id?: string
          pending_days?: number
          updated_at?: string | null
          used_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_carryover: {
        Row: {
          days_carried: number
          employee_id: string
          expiry_date: string | null
          from_year: number
          id: string
          leave_type_id: string
          processed_at: string | null
          processed_by: string | null
          to_year: number
        }
        Insert: {
          days_carried?: number
          employee_id: string
          expiry_date?: string | null
          from_year: number
          id?: string
          leave_type_id: string
          processed_at?: string | null
          processed_by?: string | null
          to_year: number
        }
        Update: {
          days_carried?: number
          employee_id?: string
          expiry_date?: string | null
          from_year?: number
          id?: string
          leave_type_id?: string
          processed_at?: string | null
          processed_by?: string | null
          to_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_carryover_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_leave_carryover_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_carryover_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_carryover_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_requests: {
        Row: {
          created_at: string | null
          days_count: number
          employee_id: string
          end_date: string
          hr_action_at: string | null
          hr_action_by: string | null
          hr_notes: string | null
          hr_status: string
          id: string
          leave_type_id: string
          manager_action_at: string | null
          manager_action_by: string | null
          manager_id: string | null
          manager_notes: string | null
          manager_status: string
          reason: string | null
          rejection_reason: string | null
          start_date: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          days_count: number
          employee_id: string
          end_date: string
          hr_action_at?: string | null
          hr_action_by?: string | null
          hr_notes?: string | null
          hr_status?: string
          id?: string
          leave_type_id: string
          manager_action_at?: string | null
          manager_action_by?: string | null
          manager_id?: string | null
          manager_notes?: string | null
          manager_status?: string
          reason?: string | null
          rejection_reason?: string | null
          start_date: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          days_count?: number
          employee_id?: string
          end_date?: string
          hr_action_at?: string | null
          hr_action_by?: string | null
          hr_notes?: string | null
          hr_status?: string
          id?: string
          leave_type_id?: string
          manager_action_at?: string | null
          manager_action_by?: string | null
          manager_id?: string | null
          manager_notes?: string | null
          manager_status?: string
          reason?: string | null
          rejection_reason?: string | null
          start_date?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_hr_action_by_fkey"
            columns: ["hr_action_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_manager_action_by_fkey"
            columns: ["manager_action_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_leave_requests_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_types: {
        Row: {
          created_at: string | null
          default_days_per_year: number
          description: string | null
          gender_specific: string | null
          id: string
          is_active: boolean | null
          is_paid: boolean | null
          name: string
          requires_approval: boolean | null
        }
        Insert: {
          created_at?: string | null
          default_days_per_year?: number
          description?: string | null
          gender_specific?: string | null
          id?: string
          is_active?: boolean | null
          is_paid?: boolean | null
          name: string
          requires_approval?: boolean | null
        }
        Update: {
          created_at?: string | null
          default_days_per_year?: number
          description?: string | null
          gender_specific?: string | null
          id?: string
          is_active?: boolean | null
          is_paid?: boolean | null
          name?: string
          requires_approval?: boolean | null
        }
        Relationships: []
      }
      hr_payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          basic_salary: number
          bonus: number
          created_at: string | null
          created_by: string | null
          employee_id: string
          employee_pension: number
          employer_pension: number
          gross_salary: number
          housing_allowance: number
          id: string
          itf: number
          net_salary: number
          nhf_deduction: number
          notes: string | null
          notification_sent: boolean
          nsitf: number
          other_allowances: number
          other_deductions: number
          paid_by: string | null
          pay_month: number
          pay_year: number
          paye_tax: number
          payment_date: string | null
          payment_method: string | null
          payment_reference: string | null
          status: string
          total_deductions: number
          total_employer_cost: number
          transport_allowance: number
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          basic_salary?: number
          bonus?: number
          created_at?: string | null
          created_by?: string | null
          employee_id: string
          employee_pension?: number
          employer_pension?: number
          gross_salary?: number
          housing_allowance?: number
          id?: string
          itf?: number
          net_salary?: number
          nhf_deduction?: number
          notes?: string | null
          notification_sent?: boolean
          nsitf?: number
          other_allowances?: number
          other_deductions?: number
          paid_by?: string | null
          pay_month: number
          pay_year: number
          paye_tax?: number
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          status?: string
          total_deductions?: number
          total_employer_cost?: number
          transport_allowance?: number
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          basic_salary?: number
          bonus?: number
          created_at?: string | null
          created_by?: string | null
          employee_id?: string
          employee_pension?: number
          employer_pension?: number
          gross_salary?: number
          housing_allowance?: number
          id?: string
          itf?: number
          net_salary?: number
          nhf_deduction?: number
          notes?: string | null
          notification_sent?: boolean
          nsitf?: number
          other_allowances?: number
          other_deductions?: number
          paid_by?: string | null
          pay_month?: number
          pay_year?: number
          paye_tax?: number
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          status?: string
          total_deductions?: number
          total_employer_cost?: number
          transport_allowance?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_runs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_payroll_runs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_runs_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_public_holidays: {
        Row: {
          created_at: string | null
          holiday_date: string
          id: string
          is_active: boolean | null
          name: string
          year: number | null
        }
        Insert: {
          created_at?: string | null
          holiday_date: string
          id?: string
          is_active?: boolean | null
          name: string
          year?: number | null
        }
        Update: {
          created_at?: string | null
          holiday_date?: string
          id?: string
          is_active?: boolean | null
          name?: string
          year?: number | null
        }
        Relationships: []
      }
      hr_task_comments: {
        Row: {
          author_admin_id: string | null
          author_employee_id: string | null
          content: string
          created_at: string | null
          id: string
          task_id: string
        }
        Insert: {
          author_admin_id?: string | null
          author_employee_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          task_id: string
        }
        Update: {
          author_admin_id?: string | null
          author_employee_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_task_comments_author_admin_id_fkey"
            columns: ["author_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_task_comments_author_employee_id_fkey"
            columns: ["author_employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_task_comments_author_employee_id_fkey"
            columns: ["author_employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "hr_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_tasks: {
        Row: {
          assigned_by_admin: string | null
          assigned_by_employee: string | null
          assigned_to: string | null
          completed_at: string | null
          completion_notes: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_by_admin?: string | null
          assigned_by_employee?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_by_admin?: string | null
          assigned_by_employee?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_tasks_assigned_by_admin_fkey"
            columns: ["assigned_by_admin"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_tasks_assigned_by_employee_fkey"
            columns: ["assigned_by_employee"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_tasks_assigned_by_employee_fkey"
            columns: ["assigned_by_employee"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "hr_employee_performance"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billing_address: string | null
          billing_city: string | null
          billing_country: string | null
          billing_state: string | null
          coupon_code: string | null
          created_at: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          delivery_fee: number
          discount_amount: number
          due_date: string | null
          generated_by: string | null
          gift_message: string | null
          gift_wrap: boolean | null
          id: string
          invoice_date: string
          invoice_number: string
          is_gift: boolean | null
          line_items: Json
          notes: string | null
          order_id: string
          order_number: string
          paid_at: string | null
          payment_method: string | null
          payment_status: string | null
          paystack_reference: string | null
          service_fee: number
          status: string
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_state?: string | null
          coupon_code?: string | null
          created_at?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          delivery_fee?: number
          discount_amount?: number
          due_date?: string | null
          generated_by?: string | null
          gift_message?: string | null
          gift_wrap?: boolean | null
          id?: string
          invoice_date?: string
          invoice_number: string
          is_gift?: boolean | null
          line_items?: Json
          notes?: string | null
          order_id: string
          order_number: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          paystack_reference?: string | null
          service_fee?: number
          status?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_state?: string | null
          coupon_code?: string | null
          created_at?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          delivery_fee?: number
          discount_amount?: number
          due_date?: string | null
          generated_by?: string | null
          gift_message?: string | null
          gift_wrap?: boolean | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          is_gift?: boolean | null
          line_items?: Json
          notes?: string | null
          order_id?: string
          order_number?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          paystack_reference?: string | null
          service_fee?: number
          status?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "invoices_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_email_log: {
        Row: {
          customer_email: string
          email_type: string
          id: string
          metadata: Json | null
          order_id: string | null
          sent_at: string | null
        }
        Insert: {
          customer_email: string
          email_type: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          sent_at?: string | null
        }
        Update: {
          customer_email?: string
          email_type?: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_email_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "marketing_email_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "marketing_email_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_email_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      maternity_bundle_snapshots: {
        Row: {
          budget_amount: number
          bundle_id: string
          bundle_tier: string
          gender: string
          id: string
          item_count: number
          items_snapshot: Json
          retail_total: number
          scope: string
          sell_price: number
          snapped_at: string
          stage: string
        }
        Insert: {
          budget_amount: number
          bundle_id: string
          bundle_tier: string
          gender?: string
          id?: string
          item_count?: number
          items_snapshot?: Json
          retail_total?: number
          scope?: string
          sell_price?: number
          snapped_at?: string
          stage?: string
        }
        Update: {
          budget_amount?: number
          bundle_id?: string
          bundle_tier?: string
          gender?: string
          id?: string
          item_count?: number
          items_snapshot?: Json
          retail_total?: number
          scope?: string
          sell_price?: number
          snapped_at?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "maternity_bundle_snapshots_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_category_products: {
        Row: {
          category_slug: string
          created_at: string | null
          default_brand_id: string | null
          display_label: string | null
          id: string
          is_active: boolean
          product_id: string
          product_order: number
          updated_at: string | null
        }
        Insert: {
          category_slug: string
          created_at?: string | null
          default_brand_id?: string | null
          display_label?: string | null
          id?: string
          is_active?: boolean
          product_id: string
          product_order?: number
          updated_at?: string | null
        }
        Update: {
          category_slug?: string
          created_at?: string | null
          default_brand_id?: string | null
          display_label?: string | null
          id?: string
          is_active?: boolean
          product_id?: string
          product_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merch_category_products_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "merch_category_products_default_brand_id_fkey"
            columns: ["default_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_category_products_default_brand_id_fkey"
            columns: ["default_brand_id"]
            isOneToOne: false
            referencedRelation: "brands_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_category_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_category_section_brands: {
        Row: {
          brand_id: string
          brand_order: number | null
          category_slug: string
          created_at: string
          display_label: string | null
          id: string
          is_active: boolean
          product_id: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          brand_order?: number | null
          category_slug: string
          created_at?: string
          display_label?: string | null
          id?: string
          is_active?: boolean
          product_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          brand_order?: number | null
          category_slug?: string
          created_at?: string
          display_label?: string | null
          id?: string
          is_active?: boolean
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merch_category_section_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_category_section_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_category_section_brands_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "merch_category_section_brands_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_section_products: {
        Row: {
          category_slug: string
          created_at: string | null
          default_brand_id: string | null
          display_label: string | null
          id: string
          is_active: boolean
          product_id: string
          product_order: number
          shop: string
          updated_at: string | null
        }
        Insert: {
          category_slug: string
          created_at?: string | null
          default_brand_id?: string | null
          display_label?: string | null
          id?: string
          is_active?: boolean
          product_id: string
          product_order?: number
          shop: string
          updated_at?: string | null
        }
        Update: {
          category_slug?: string
          created_at?: string | null
          default_brand_id?: string | null
          display_label?: string | null
          id?: string
          is_active?: boolean
          product_id?: string
          product_order?: number
          shop?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merch_section_products_default_brand_id_fkey"
            columns: ["default_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_section_products_default_brand_id_fkey"
            columns: ["default_brand_id"]
            isOneToOne: false
            referencedRelation: "brands_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_section_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_section_products_shop_category_slug_fkey"
            columns: ["shop", "category_slug"]
            isOneToOne: false
            referencedRelation: "merch_shop_sections"
            referencedColumns: ["shop", "category_slug"]
          },
        ]
      }
      merch_shop_sections: {
        Row: {
          category_slug: string
          created_at: string | null
          id: string
          is_active: boolean
          section_label: string | null
          section_order: number
          shop: string
          updated_at: string | null
        }
        Insert: {
          category_slug: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          section_label?: string | null
          section_order?: number
          shop: string
          updated_at?: string | null
        }
        Update: {
          category_slug?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          section_label?: string | null
          section_order?: number
          shop?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merch_shop_sections_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      navigation_links: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          label: string
          location: string
          open_in_new_tab: boolean | null
          parent_id: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          label: string
          location: string
          open_in_new_tab?: boolean | null
          parent_id?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          label?: string
          location?: string
          open_in_new_tab?: boolean | null
          parent_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "navigation_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "navigation_links"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          brand_id: string | null
          brand_name: string
          bundle_name: string | null
          cogs_amount: number | null
          color: string | null
          cost_price: number | null
          created_at: string | null
          discount_amount: number | null
          gross_sales: number | null
          id: string
          line_cost: number | null
          line_total: number
          net_sales: number | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          returns_amount: number | null
          shipping_alloc: number | null
          size: string | null
          tax_amount: number | null
          unit_price: number
        }
        Insert: {
          brand_id?: string | null
          brand_name: string
          bundle_name?: string | null
          cogs_amount?: number | null
          color?: string | null
          cost_price?: number | null
          created_at?: string | null
          discount_amount?: number | null
          gross_sales?: number | null
          id?: string
          line_cost?: number | null
          line_total: number
          net_sales?: number | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          returns_amount?: number | null
          shipping_alloc?: number | null
          size?: string | null
          tax_amount?: number | null
          unit_price: number
        }
        Update: {
          brand_id?: string | null
          brand_name?: string
          bundle_name?: string | null
          cogs_amount?: number | null
          color?: string | null
          cost_price?: number | null
          created_at?: string | null
          discount_amount?: number | null
          gross_sales?: number | null
          id?: string
          line_cost?: number | null
          line_total?: number
          net_sales?: number | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          returns_amount?: number | null
          shipping_alloc?: number | null
          size?: string | null
          tax_amount?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notes: {
        Row: {
          admin_user_id: string | null
          created_at: string | null
          id: string
          is_customer_note: boolean | null
          note: string
          order_id: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string | null
          id?: string
          is_customer_note?: boolean | null
          note: string
          order_id: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string | null
          id?: string
          is_customer_note?: boolean | null
          note?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notes_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      order_picking_items: {
        Row: {
          id: string
          is_picked: boolean
          notes: string | null
          order_item_id: string
          picked_at: string | null
          picked_by: string | null
          session_id: string
          vendor_id: string | null
        }
        Insert: {
          id?: string
          is_picked?: boolean
          notes?: string | null
          order_item_id: string
          picked_at?: string | null
          picked_by?: string | null
          session_id: string
          vendor_id?: string | null
        }
        Update: {
          id?: string
          is_picked?: boolean
          notes?: string | null
          order_item_id?: string
          picked_at?: string | null
          picked_by?: string | null
          session_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_picking_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "admin_order_item_profit_view"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "order_picking_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_picking_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_item_uuid"]
          },
          {
            foreignKeyName: "order_picking_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "order_picking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_picking_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      order_picking_sessions: {
        Row: {
          completed_at: string | null
          id: string
          notes: string | null
          order_id: string
          started_at: string | null
          started_by: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          started_at?: string | null
          started_by?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          started_at?: string | null
          started_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_picking_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_picking_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "order_picking_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_picking_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      order_returns: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string | null
          handled_by: string | null
          id: string
          items_returned: Json | null
          order_id: string
          refund_amount: number | null
          refund_issued: boolean | null
          refunded_at: string | null
          rejection_reason: string | null
          return_date: string
          return_reason: string
          return_reason_notes: string | null
          return_type: string
          status: string
          stock_restored: boolean | null
          store_credit_issued: number | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          handled_by?: string | null
          id?: string
          items_returned?: Json | null
          order_id: string
          refund_amount?: number | null
          refund_issued?: boolean | null
          refunded_at?: string | null
          rejection_reason?: string | null
          return_date: string
          return_reason: string
          return_reason_notes?: string | null
          return_type?: string
          status?: string
          stock_restored?: boolean | null
          store_credit_issued?: number | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          handled_by?: string | null
          id?: string
          items_returned?: Json | null
          order_id?: string
          refund_amount?: number | null
          refund_issued?: boolean | null
          refunded_at?: string | null
          rejection_reason?: string | null
          return_date?: string
          return_reason?: string
          return_reason_notes?: string | null
          return_type?: string
          status?: string
          stock_restored?: boolean | null
          store_credit_issued?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_returns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_returns_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "order_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          id: string
          is_payment_update: boolean | null
          new_payment_status: string | null
          new_status: string
          note: string | null
          old_payment_status: string | null
          old_status: string | null
          order_id: string
          override_reason: string | null
          override_type: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          is_payment_update?: boolean | null
          new_payment_status?: string | null
          new_status: string
          note?: string | null
          old_payment_status?: string | null
          old_status?: string | null
          order_id: string
          override_reason?: string | null
          override_type?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          is_payment_update?: boolean | null
          new_payment_status?: string | null
          new_status?: string
          note?: string | null
          old_payment_status?: string | null
          old_status?: string | null
          order_id?: string
          override_reason?: string | null
          override_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      orders: {
        Row: {
          actual_courier_partner: string | null
          actual_delivery_cost: number | null
          actual_delivery_date: string | null
          assigned_at: string | null
          assigned_picker_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          coupon_id: string | null
          courier_changed_reason: string | null
          courier_cost_confirmed: boolean | null
          courier_note: string | null
          created_at: string | null
          customer_email: string
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_address: string
          delivery_city: string
          delivery_fee: number
          delivery_notes: string | null
          delivery_partner: string | null
          delivery_state: string
          discount: number | null
          discount_amount: number | null
          estimated_delivery_end: string | null
          estimated_delivery_start: string | null
          estimated_weight_kg: number | null
          express_acknowledged: boolean
          express_delivery_quote: number | null
          express_payment_reference: string | null
          express_quoted_at: string | null
          express_status: string | null
          from_quote_id: string | null
          fulfillment_notes: string | null
          gift_message: string | null
          gift_wrap_fee: number | null
          gift_wrapping: boolean | null
          gross_profit: number | null
          id: string
          is_bundle_order: boolean | null
          is_express_order: boolean
          is_quiz_order: boolean | null
          is_subscription_order: boolean
          landing_page: string | null
          last_edit_notified_at: string | null
          last_edited_at: string | null
          last_edited_by: string | null
          order_number: string | null
          order_status: string | null
          packaging_cost: number | null
          packed_at: string | null
          partner_cost: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string | null
          paystack_fee: number | null
          paystack_transaction_id: string | null
          picking_started_at: string | null
          quiz_answers: Json | null
          referral_code_used: string | null
          referrer: string | null
          refund_amount: number | null
          refunded_at: string | null
          return_reason: string | null
          returned_at: string | null
          service_fee: number
          shipped_at: string | null
          spend_discount_amount: number | null
          spend_discount_id: string | null
          spend_discount_percent: number | null
          subscription_order_id: string | null
          subtotal: number
          total: number
          tracking_number: string | null
          traffic_source: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          actual_courier_partner?: string | null
          actual_delivery_cost?: number | null
          actual_delivery_date?: string | null
          assigned_at?: string | null
          assigned_picker_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          coupon_id?: string | null
          courier_changed_reason?: string | null
          courier_cost_confirmed?: boolean | null
          courier_note?: string | null
          created_at?: string | null
          customer_email: string
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          delivery_address: string
          delivery_city: string
          delivery_fee?: number
          delivery_notes?: string | null
          delivery_partner?: string | null
          delivery_state: string
          discount?: number | null
          discount_amount?: number | null
          estimated_delivery_end?: string | null
          estimated_delivery_start?: string | null
          estimated_weight_kg?: number | null
          express_acknowledged?: boolean
          express_delivery_quote?: number | null
          express_payment_reference?: string | null
          express_quoted_at?: string | null
          express_status?: string | null
          from_quote_id?: string | null
          fulfillment_notes?: string | null
          gift_message?: string | null
          gift_wrap_fee?: number | null
          gift_wrapping?: boolean | null
          gross_profit?: number | null
          id?: string
          is_bundle_order?: boolean | null
          is_express_order?: boolean
          is_quiz_order?: boolean | null
          is_subscription_order?: boolean
          landing_page?: string | null
          last_edit_notified_at?: string | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          order_number?: string | null
          order_status?: string | null
          packaging_cost?: number | null
          packed_at?: string | null
          partner_cost?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          paystack_fee?: number | null
          paystack_transaction_id?: string | null
          picking_started_at?: string | null
          quiz_answers?: Json | null
          referral_code_used?: string | null
          referrer?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          return_reason?: string | null
          returned_at?: string | null
          service_fee?: number
          shipped_at?: string | null
          spend_discount_amount?: number | null
          spend_discount_id?: string | null
          spend_discount_percent?: number | null
          subscription_order_id?: string | null
          subtotal: number
          total: number
          tracking_number?: string | null
          traffic_source?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          actual_courier_partner?: string | null
          actual_delivery_cost?: number | null
          actual_delivery_date?: string | null
          assigned_at?: string | null
          assigned_picker_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          coupon_id?: string | null
          courier_changed_reason?: string | null
          courier_cost_confirmed?: boolean | null
          courier_note?: string | null
          created_at?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          delivery_address?: string
          delivery_city?: string
          delivery_fee?: number
          delivery_notes?: string | null
          delivery_partner?: string | null
          delivery_state?: string
          discount?: number | null
          discount_amount?: number | null
          estimated_delivery_end?: string | null
          estimated_delivery_start?: string | null
          estimated_weight_kg?: number | null
          express_acknowledged?: boolean
          express_delivery_quote?: number | null
          express_payment_reference?: string | null
          express_quoted_at?: string | null
          express_status?: string | null
          from_quote_id?: string | null
          fulfillment_notes?: string | null
          gift_message?: string | null
          gift_wrap_fee?: number | null
          gift_wrapping?: boolean | null
          gross_profit?: number | null
          id?: string
          is_bundle_order?: boolean | null
          is_express_order?: boolean
          is_quiz_order?: boolean | null
          is_subscription_order?: boolean
          landing_page?: string | null
          last_edit_notified_at?: string | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          order_number?: string | null
          order_status?: string | null
          packaging_cost?: number | null
          packed_at?: string | null
          partner_cost?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          paystack_fee?: number | null
          paystack_transaction_id?: string | null
          picking_started_at?: string | null
          quiz_answers?: Json | null
          referral_code_used?: string | null
          referrer?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          return_reason?: string | null
          returned_at?: string | null
          service_fee?: number
          shipped_at?: string | null
          spend_discount_amount?: number | null
          spend_discount_id?: string | null
          spend_discount_percent?: number | null
          subscription_order_id?: string | null
          subtotal?: number
          total?: number
          tracking_number?: string | null
          traffic_source?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_picker_id_fkey"
            columns: ["assigned_picker_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_from_quote_id_fkey"
            columns: ["from_quote_id"]
            isOneToOne: false
            referencedRelation: "admin_quotes_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_from_quote_id_fkey"
            columns: ["from_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_subscription_order_id_fkey"
            columns: ["subscription_order_id"]
            isOneToOne: false
            referencedRelation: "subscription_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          created_at: string | null
          id: string
          page_title: string | null
          page_url: string
          referrer: string | null
          scroll_depth_percent: number | null
          session_id: string
          time_on_page_seconds: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          page_title?: string | null
          page_url: string
          referrer?: string | null
          scroll_depth_percent?: number | null
          session_id: string
          time_on_page_seconds?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          page_title?: string | null
          page_url?: string
          referrer?: string | null
          scroll_depth_percent?: number | null
          session_id?: string
          time_on_page_seconds?: number | null
        }
        Relationships: []
      }
      pages: {
        Row: {
          body_blocks: Json | null
          content: string
          created_at: string | null
          hero_text: string | null
          id: string
          is_published: boolean | null
          last_updated_label: string | null
          meta_description: string | null
          meta_title: string | null
          slug: string
          title: string
          updated_at: string | null
        }
        Insert: {
          body_blocks?: Json | null
          content?: string
          created_at?: string | null
          hero_text?: string | null
          id?: string
          is_published?: boolean | null
          last_updated_label?: string | null
          meta_description?: string | null
          meta_title?: string | null
          slug: string
          title: string
          updated_at?: string | null
        }
        Update: {
          body_blocks?: Json | null
          content?: string
          created_at?: string | null
          hero_text?: string | null
          id?: string
          is_published?: boolean | null
          last_updated_label?: string | null
          meta_description?: string | null
          meta_title?: string | null
          slug?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      preview_tokens: {
        Row: {
          access_count: number
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          label: string
          last_used_at: string | null
          token: string
          updated_at: string | null
        }
        Insert: {
          access_count?: number
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          last_used_at?: string | null
          token?: string
          updated_at?: string | null
        }
        Update: {
          access_count?: number
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_used_at?: string | null
          token?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preview_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          merch_page_label: string | null
          name: string
          parent_category: string | null
          slug: string
          stage_order: number | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          merch_page_label?: string | null
          name: string
          parent_category?: string | null
          slug: string
          stage_order?: number | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          merch_page_label?: string | null
          name?: string
          parent_category?: string | null
          slug?: string
          stage_order?: number | null
        }
        Relationships: []
      }
      product_colors: {
        Row: {
          color_hex: string | null
          color_name: string
          display_order: number | null
          gender_match: string | null
          id: string
          in_stock: boolean | null
          product_id: string
        }
        Insert: {
          color_hex?: string | null
          color_name: string
          display_order?: number | null
          gender_match?: string | null
          id?: string
          in_stock?: boolean | null
          product_id: string
        }
        Update: {
          color_hex?: string | null
          color_name?: string
          display_order?: number | null
          gender_match?: string | null
          id?: string
          in_stock?: boolean | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_colors_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          brand_id: string | null
          created_at: string | null
          display_order: number | null
          file_size: number | null
          height: number | null
          id: string
          image_url: string
          is_primary: boolean | null
          medium_url: string | null
          product_id: string | null
          thumbnail_url: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          brand_id?: string | null
          created_at?: string | null
          display_order?: number | null
          file_size?: number | null
          height?: number | null
          id?: string
          image_url: string
          is_primary?: boolean | null
          medium_url?: string | null
          product_id?: string | null
          thumbnail_url?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          brand_id?: string | null
          created_at?: string | null
          display_order?: number | null
          file_size?: number | null
          height?: number | null
          id?: string
          image_url?: string
          is_primary?: boolean | null
          medium_url?: string | null
          product_id?: string | null
          thumbnail_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sizes: {
        Row: {
          display_order: number | null
          id: string
          in_stock: boolean | null
          is_default: boolean | null
          product_id: string
          size_code: string
          size_label: string
        }
        Insert: {
          display_order?: number | null
          id?: string
          in_stock?: boolean | null
          is_default?: boolean | null
          product_id: string
          size_code: string
          size_label: string
        }
        Update: {
          display_order?: number | null
          id?: string
          in_stock?: boolean | null
          is_default?: boolean | null
          product_id?: string
          size_code?: string
          size_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_sizes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          id: string
          normalised_value: string | null
          product_id: string
          tag_type: string
          tag_value: string
        }
        Insert: {
          id?: string
          normalised_value?: string | null
          product_id: string
          tag_type: string
          tag_value: string
        }
        Update: {
          id?: string
          normalised_value?: string | null
          product_id?: string
          tag_type?: string
          tag_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          allergen_info: string | null
          badge: string | null
          badge_label: string | null
          bundle_discount_pct: number
          bundle_label: string | null
          category: string
          category_label: string | null
          contents: string | null
          created_at: string | null
          deleted_at: string | null
          delivery_methods: string[] | null
          description: string
          display_order: number | null
          emoji: string | null
          featured_order: number | null
          first_baby: boolean | null
          gender_colors: Json | null
          gender_relevant: boolean | null
          gift_box_markup_pct: number | null
          hospital_types: string[] | null
          how_to_use: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_bestseller: boolean | null
          is_consumable: boolean | null
          is_convenience: boolean | null
          is_featured: boolean | null
          is_gift_box: boolean
          is_out_of_stock: boolean
          is_push_gift_eligible: boolean | null
          is_subscribable: boolean
          long_description: string | null
          material: string | null
          meta_description: string | null
          meta_title: string | null
          multiples_bump: number | null
          name: string
          og_image_url: string | null
          pack_count: string | null
          priority: string
          product_slot: string | null
          push_gift_categories: string[] | null
          quiz_priority: string | null
          rating: number | null
          reorder_days: number | null
          reorder_label: string | null
          review_count: number | null
          safety_info: string | null
          scheduled_for: string | null
          scopes: string[] | null
          shop_section_order: number | null
          sku: string | null
          slug: string
          stage_order: number | null
          stages: string[] | null
          subcategory: string | null
          updated_at: string | null
          video_url: string | null
          weight_kg: number | null
          why_included: string | null
          why_included_variants: Json | null
        }
        Insert: {
          allergen_info?: string | null
          badge?: string | null
          badge_label?: string | null
          bundle_discount_pct?: number
          bundle_label?: string | null
          category: string
          category_label?: string | null
          contents?: string | null
          created_at?: string | null
          deleted_at?: string | null
          delivery_methods?: string[] | null
          description: string
          display_order?: number | null
          emoji?: string | null
          featured_order?: number | null
          first_baby?: boolean | null
          gender_colors?: Json | null
          gender_relevant?: boolean | null
          gift_box_markup_pct?: number | null
          hospital_types?: string[] | null
          how_to_use?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_bestseller?: boolean | null
          is_consumable?: boolean | null
          is_convenience?: boolean | null
          is_featured?: boolean | null
          is_gift_box?: boolean
          is_out_of_stock?: boolean
          is_push_gift_eligible?: boolean | null
          is_subscribable?: boolean
          long_description?: string | null
          material?: string | null
          meta_description?: string | null
          meta_title?: string | null
          multiples_bump?: number | null
          name: string
          og_image_url?: string | null
          pack_count?: string | null
          priority: string
          product_slot?: string | null
          push_gift_categories?: string[] | null
          quiz_priority?: string | null
          rating?: number | null
          reorder_days?: number | null
          reorder_label?: string | null
          review_count?: number | null
          safety_info?: string | null
          scheduled_for?: string | null
          scopes?: string[] | null
          shop_section_order?: number | null
          sku?: string | null
          slug: string
          stage_order?: number | null
          stages?: string[] | null
          subcategory?: string | null
          updated_at?: string | null
          video_url?: string | null
          weight_kg?: number | null
          why_included?: string | null
          why_included_variants?: Json | null
        }
        Update: {
          allergen_info?: string | null
          badge?: string | null
          badge_label?: string | null
          bundle_discount_pct?: number
          bundle_label?: string | null
          category?: string
          category_label?: string | null
          contents?: string | null
          created_at?: string | null
          deleted_at?: string | null
          delivery_methods?: string[] | null
          description?: string
          display_order?: number | null
          emoji?: string | null
          featured_order?: number | null
          first_baby?: boolean | null
          gender_colors?: Json | null
          gender_relevant?: boolean | null
          gift_box_markup_pct?: number | null
          hospital_types?: string[] | null
          how_to_use?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_bestseller?: boolean | null
          is_consumable?: boolean | null
          is_convenience?: boolean | null
          is_featured?: boolean | null
          is_gift_box?: boolean
          is_out_of_stock?: boolean
          is_push_gift_eligible?: boolean | null
          is_subscribable?: boolean
          long_description?: string | null
          material?: string | null
          meta_description?: string | null
          meta_title?: string | null
          multiples_bump?: number | null
          name?: string
          og_image_url?: string | null
          pack_count?: string | null
          priority?: string
          product_slot?: string | null
          push_gift_categories?: string[] | null
          quiz_priority?: string | null
          rating?: number | null
          reorder_days?: number | null
          reorder_label?: string | null
          review_count?: number | null
          safety_info?: string | null
          scheduled_for?: string | null
          scopes?: string[] | null
          shop_section_order?: number | null
          sku?: string | null
          slug?: string
          stage_order?: number | null
          stages?: string[] | null
          subcategory?: string | null
          updated_at?: string | null
          video_url?: string | null
          weight_kg?: number | null
          why_included?: string | null
          why_included_variants?: Json | null
        }
        Relationships: []
      }
      quiz_adjustment_rules: {
        Row: {
          action: string
          action_value: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          priority: number | null
          rule_name: string
          target_product_slug: string
          trigger_operator: string | null
          trigger_step_id: string
          trigger_value: string
        }
        Insert: {
          action: string
          action_value?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          rule_name: string
          target_product_slug: string
          trigger_operator?: string | null
          trigger_step_id: string
          trigger_value: string
        }
        Update: {
          action?: string
          action_value?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          rule_name?: string
          target_product_slug?: string
          trigger_operator?: string | null
          trigger_step_id?: string
          trigger_value?: string
        }
        Relationships: []
      }
      quiz_customers: {
        Row: {
          baby_gender: string | null
          budget_tier: string | null
          created_at: string | null
          dad_purpose: string | null
          delivery_method: string | null
          first_baby: boolean | null
          full_answers: Json | null
          gift_message: string | null
          gift_wrap: boolean | null
          has_purchased: boolean | null
          hospital_type: string | null
          id: string
          multiples: string | null
          notification_sent_at: string | null
          order_id: string | null
          page_url: string | null
          purchase_amount: number | null
          purchased_at: string | null
          push_gift_budget: string | null
          push_gift_category: string | null
          push_gift_timing: string | null
          referral_source: string | null
          scope: string | null
          session_id: string | null
          shopper_type: string | null
          stage: string | null
          updated_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
          baby_gender?: string | null
          budget_tier?: string | null
          created_at?: string | null
          dad_purpose?: string | null
          delivery_method?: string | null
          first_baby?: boolean | null
          full_answers?: Json | null
          gift_message?: string | null
          gift_wrap?: boolean | null
          has_purchased?: boolean | null
          hospital_type?: string | null
          id?: string
          multiples?: string | null
          notification_sent_at?: string | null
          order_id?: string | null
          page_url?: string | null
          purchase_amount?: number | null
          purchased_at?: string | null
          push_gift_budget?: string | null
          push_gift_category?: string | null
          push_gift_timing?: string | null
          referral_source?: string | null
          scope?: string | null
          session_id?: string | null
          shopper_type?: string | null
          stage?: string | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          baby_gender?: string | null
          budget_tier?: string | null
          created_at?: string | null
          dad_purpose?: string | null
          delivery_method?: string | null
          first_baby?: boolean | null
          full_answers?: Json | null
          gift_message?: string | null
          gift_wrap?: boolean | null
          has_purchased?: boolean | null
          hospital_type?: string | null
          id?: string
          multiples?: string | null
          notification_sent_at?: string | null
          order_id?: string | null
          page_url?: string | null
          purchase_amount?: number | null
          purchased_at?: string | null
          push_gift_budget?: string | null
          push_gift_category?: string | null
          push_gift_timing?: string | null
          referral_source?: string | null
          scope?: string | null
          session_id?: string | null
          shopper_type?: string | null
          stage?: string | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_customers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "quiz_customers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "quiz_customers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_customers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      quiz_options: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          option_description: string | null
          option_emoji: string | null
          option_label: string
          option_value: string
          price_modifier: number | null
          question_id: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          option_description?: string | null
          option_emoji?: string | null
          option_label: string
          option_value: string
          price_modifier?: number | null
          question_id: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          option_description?: string | null
          option_emoji?: string | null
          option_label?: string
          option_value?: string
          price_modifier?: number | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          applies_to_path: string[] | null
          created_at: string | null
          id: string
          input_type: string
          is_active: boolean | null
          is_skippable: boolean | null
          question_text: string
          step_id: string
          step_label: string
          step_order: number
          sub_text: string | null
          ui_config: Json | null
          updated_at: string | null
        }
        Insert: {
          applies_to_path?: string[] | null
          created_at?: string | null
          id?: string
          input_type?: string
          is_active?: boolean | null
          is_skippable?: boolean | null
          question_text: string
          step_id: string
          step_label: string
          step_order: number
          sub_text?: string | null
          ui_config?: Json | null
          updated_at?: string | null
        }
        Update: {
          applies_to_path?: string[] | null
          created_at?: string | null
          id?: string
          input_type?: string
          is_active?: boolean | null
          is_skippable?: boolean | null
          question_text?: string
          step_id?: string
          step_label?: string
          step_order?: number
          sub_text?: string | null
          ui_config?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quiz_routing_rules: {
        Row: {
          condition_answer: string | null
          condition_operator: string | null
          created_at: string | null
          from_step_id: string
          id: string
          is_active: boolean | null
          next_step_id: string
          priority: number | null
        }
        Insert: {
          condition_answer?: string | null
          condition_operator?: string | null
          created_at?: string | null
          from_step_id: string
          id?: string
          is_active?: boolean | null
          next_step_id: string
          priority?: number | null
        }
        Update: {
          condition_answer?: string | null
          condition_operator?: string | null
          created_at?: string | null
          from_step_id?: string
          id?: string
          is_active?: boolean | null
          next_step_id?: string
          priority?: number | null
        }
        Relationships: []
      }
      quiz_sessions: {
        Row: {
          answers: Json
          converted_to_order: boolean | null
          created_at: string | null
          current_step: string | null
          dad_purpose: string | null
          engine_version: string | null
          id: string
          is_completed: boolean | null
          order_id: string | null
          push_gift_category: string | null
          push_gift_timing: string | null
          result_bundle_slug: string | null
          result_product_count: number | null
          result_product_ids: string[] | null
          result_tier: string | null
          session_id: string
          shopper_type: string | null
          steps_completed: string[] | null
          updated_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
          answers?: Json
          converted_to_order?: boolean | null
          created_at?: string | null
          current_step?: string | null
          dad_purpose?: string | null
          engine_version?: string | null
          id?: string
          is_completed?: boolean | null
          order_id?: string | null
          push_gift_category?: string | null
          push_gift_timing?: string | null
          result_bundle_slug?: string | null
          result_product_count?: number | null
          result_product_ids?: string[] | null
          result_tier?: string | null
          session_id: string
          shopper_type?: string | null
          steps_completed?: string[] | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          answers?: Json
          converted_to_order?: boolean | null
          created_at?: string | null
          current_step?: string | null
          dad_purpose?: string | null
          engine_version?: string | null
          id?: string
          is_completed?: boolean | null
          order_id?: string | null
          push_gift_category?: string | null
          push_gift_timing?: string | null
          result_bundle_slug?: string | null
          result_product_count?: number | null
          result_product_ids?: string[] | null
          result_tier?: string | null
          session_id?: string
          shopper_type?: string | null
          steps_completed?: string[] | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "quiz_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "quiz_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      quiz_target_counts: {
        Row: {
          budget_tier: string
          id: string
          is_active: boolean | null
          max_count: number
          min_count: number
          priority_order: string[] | null
          target_count: number
          updated_at: string | null
        }
        Insert: {
          budget_tier: string
          id?: string
          is_active?: boolean | null
          max_count: number
          min_count: number
          priority_order?: string[] | null
          target_count: number
          updated_at?: string | null
        }
        Update: {
          budget_tier?: string
          id?: string
          is_active?: boolean | null
          max_count?: number
          min_count?: number
          priority_order?: string[] | null
          target_count?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          color: string | null
          created_at: string
          display_order: number
          id: string
          line_total: number
          product_id: string | null
          product_name: string
          quantity: number
          quote_id: string
          size: string | null
          unit_price: number
        }
        Insert: {
          brand_id?: string | null
          brand_name?: string | null
          color?: string | null
          created_at?: string
          display_order?: number
          id?: string
          line_total: number
          product_id?: string | null
          product_name: string
          quantity?: number
          quote_id: string
          size?: string | null
          unit_price: number
        }
        Update: {
          brand_id?: string | null
          brand_name?: string | null
          color?: string | null
          created_at?: string
          display_order?: number
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          quote_id?: string
          size?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "admin_quotes_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_status_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          from_status: string | null
          id: string
          notes: string | null
          quote_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          quote_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          quote_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_status_history_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "admin_quotes_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_status_history_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          bypass_delivery_threshold: boolean
          bypass_spend_threshold: boolean
          converted_order_id: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          customer_notes: string | null
          customer_phone: string | null
          delivery_address: string | null
          delivery_city: string | null
          delivery_fee_override: number | null
          delivery_state: string | null
          discount_amount: number
          discount_reason: string | null
          estimated_delivery_fee: number
          expires_at: string | null
          id: string
          internal_notes: string | null
          last_viewed_at: string | null
          quote_number: string
          sent_at: string | null
          service_fee: number
          share_token: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          view_count: number
        }
        Insert: {
          accepted_at?: string | null
          bypass_delivery_threshold?: boolean
          bypass_spend_threshold?: boolean
          converted_order_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_notes?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_fee_override?: number | null
          delivery_state?: string | null
          discount_amount?: number
          discount_reason?: string | null
          estimated_delivery_fee?: number
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          last_viewed_at?: string | null
          quote_number: string
          sent_at?: string | null
          service_fee?: number
          share_token?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          view_count?: number
        }
        Update: {
          accepted_at?: string | null
          bypass_delivery_threshold?: boolean
          bypass_spend_threshold?: boolean
          converted_order_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_notes?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_fee_override?: number | null
          delivery_state?: string | null
          discount_amount?: number
          discount_reason?: string | null
          estimated_delivery_fee?: number
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          last_viewed_at?: string | null
          quote_number?: string
          sent_at?: string | null
          service_fee?: number
          share_token?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "quotes_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "quotes_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string | null
          discount_amount: number
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number
          min_order_amount: number
          referrer_credit: number
          referrer_email: string
          referrer_name: string
          referrer_order_id: string | null
          referrer_phone: string | null
          times_used: number | null
          total_earned: number | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          discount_amount?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number
          min_order_amount?: number
          referrer_credit?: number
          referrer_email: string
          referrer_name: string
          referrer_order_id?: string | null
          referrer_phone?: string | null
          times_used?: number | null
          total_earned?: number | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          discount_amount?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number
          min_order_amount?: number
          referrer_credit?: number
          referrer_email?: string
          referrer_name?: string
          referrer_order_id?: string | null
          referrer_phone?: string | null
          times_used?: number | null
          total_earned?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_referrer_order_id_fkey"
            columns: ["referrer_order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "referral_codes_referrer_order_id_fkey"
            columns: ["referrer_order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "referral_codes_referrer_order_id_fkey"
            columns: ["referrer_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_codes_referrer_order_id_fkey"
            columns: ["referrer_order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      referral_credits: {
        Row: {
          applied_order_id: string | null
          created_at: string | null
          credit_amount: number
          expires_at: string | null
          id: string
          referral_code_id: string | null
          referred_order_id: string | null
          referrer_email: string
          referrer_phone: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          applied_order_id?: string | null
          created_at?: string | null
          credit_amount?: number
          expires_at?: string | null
          id?: string
          referral_code_id?: string | null
          referred_order_id?: string | null
          referrer_email: string
          referrer_phone?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          applied_order_id?: string | null
          created_at?: string | null
          credit_amount?: number
          expires_at?: string | null
          id?: string
          referral_code_id?: string | null
          referred_order_id?: string | null
          referrer_email?: string
          referrer_phone?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_credits_applied_order_id_fkey"
            columns: ["applied_order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "referral_credits_applied_order_id_fkey"
            columns: ["applied_order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "referral_credits_applied_order_id_fkey"
            columns: ["applied_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_credits_applied_order_id_fkey"
            columns: ["applied_order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "referral_credits_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_credits_referred_order_id_fkey"
            columns: ["referred_order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "referral_credits_referred_order_id_fkey"
            columns: ["referred_order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "referral_credits_referred_order_id_fkey"
            columns: ["referred_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_credits_referred_order_id_fkey"
            columns: ["referred_order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      referral_redemptions: {
        Row: {
          created_at: string | null
          discount_amount: number
          id: string
          order_status: string | null
          redeemer_email: string | null
          redeemer_phone: string | null
          referral_code_id: string | null
          referred_order_id: string | null
          referrer_credit: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          discount_amount?: number
          id?: string
          order_status?: string | null
          redeemer_email?: string | null
          redeemer_phone?: string | null
          referral_code_id?: string | null
          referred_order_id?: string | null
          referrer_credit?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          discount_amount?: number
          id?: string
          order_status?: string | null
          redeemer_email?: string | null
          redeemer_phone?: string | null
          referral_code_id?: string | null
          referred_order_id?: string | null
          referrer_credit?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_redemptions_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_redemptions_referred_order_id_fkey"
            columns: ["referred_order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "referral_redemptions_referred_order_id_fkey"
            columns: ["referred_order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "referral_redemptions_referred_order_id_fkey"
            columns: ["referred_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_redemptions_referred_order_id_fkey"
            columns: ["referred_order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      report_dimensions: {
        Row: {
          aggregation: string | null
          category: string
          data_type: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          is_dimension: boolean | null
          is_metric: boolean | null
          name: string
          source_column: string | null
          source_table: string | null
        }
        Insert: {
          aggregation?: string | null
          category: string
          data_type?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          is_dimension?: boolean | null
          is_metric?: boolean | null
          name: string
          source_column?: string | null
          source_table?: string | null
        }
        Update: {
          aggregation?: string | null
          category?: string
          data_type?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          is_dimension?: boolean | null
          is_metric?: boolean | null
          name?: string
          source_column?: string | null
          source_table?: string | null
        }
        Relationships: []
      }
      revisions: {
        Row: {
          change_summary: string | null
          changed_by: string | null
          changed_fields: string[] | null
          created_at: string | null
          data_snapshot: Json
          entity_id: string
          entity_type: string
          id: string
          revision_number: number
        }
        Insert: {
          change_summary?: string | null
          changed_by?: string | null
          changed_fields?: string[] | null
          created_at?: string | null
          data_snapshot: Json
          entity_id: string
          entity_type: string
          id?: string
          revision_number: number
        }
        Update: {
          change_summary?: string | null
          changed_by?: string | null
          changed_fields?: string[] | null
          created_at?: string | null
          data_snapshot?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          revision_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "revisions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          browser: string | null
          city: string | null
          conversion_order_id: string | null
          converted: boolean | null
          country: string | null
          created_at: string | null
          device_type: string | null
          duration_seconds: number | null
          event_count: number | null
          exit_page: string | null
          first_seen_at: string | null
          id: string
          is_bounce: boolean | null
          landing_page: string | null
          last_seen_at: string | null
          os: string | null
          page_count: number | null
          referrer: string | null
          session_id: string
          traffic_campaign: string | null
          traffic_medium: string | null
          traffic_source: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          conversion_order_id?: string | null
          converted?: boolean | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          event_count?: number | null
          exit_page?: string | null
          first_seen_at?: string | null
          id?: string
          is_bounce?: boolean | null
          landing_page?: string | null
          last_seen_at?: string | null
          os?: string | null
          page_count?: number | null
          referrer?: string | null
          session_id: string
          traffic_campaign?: string | null
          traffic_medium?: string | null
          traffic_source?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          conversion_order_id?: string | null
          converted?: boolean | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          event_count?: number | null
          exit_page?: string | null
          first_seen_at?: string | null
          id?: string
          is_bounce?: boolean | null
          landing_page?: string | null
          last_seen_at?: string | null
          os?: string | null
          page_count?: number | null
          referrer?: string | null
          session_id?: string
          traffic_campaign?: string | null
          traffic_medium?: string | null
          traffic_source?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_conversion_order_id_fkey"
            columns: ["conversion_order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "sessions_conversion_order_id_fkey"
            columns: ["conversion_order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "sessions_conversion_order_id_fkey"
            columns: ["conversion_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_conversion_order_id_fkey"
            columns: ["conversion_order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      shared_carts: {
        Row: {
          cart_payload: Json
          created_at: string
          expires_at: string
          id: string
          last_viewed_at: string | null
          share_token: string
          view_count: number
        }
        Insert: {
          cart_payload: Json
          created_at?: string
          expires_at?: string
          id?: string
          last_viewed_at?: string | null
          share_token: string
          view_count?: number
        }
        Update: {
          cart_payload?: Json
          created_at?: string
          expires_at?: string
          id?: string
          last_viewed_at?: string | null
          share_token?: string
          view_count?: number
        }
        Relationships: []
      }
      shipping_zones: {
        Row: {
          areas: string[]
          created_at: string | null
          display_order: number | null
          estimated_days_max: number | null
          estimated_days_min: number | null
          express_available: boolean | null
          express_days_max: number | null
          express_days_min: number | null
          express_rate: number | null
          flat_rate: number
          free_delivery_threshold: number | null
          id: string
          is_active: boolean | null
          lgas: Json | null
          name: string
          partner_schedule: Json | null
          primary_partner: string | null
          secondary_partner: string | null
          states: string[] | null
        }
        Insert: {
          areas?: string[]
          created_at?: string | null
          display_order?: number | null
          estimated_days_max?: number | null
          estimated_days_min?: number | null
          express_available?: boolean | null
          express_days_max?: number | null
          express_days_min?: number | null
          express_rate?: number | null
          flat_rate: number
          free_delivery_threshold?: number | null
          id?: string
          is_active?: boolean | null
          lgas?: Json | null
          name: string
          partner_schedule?: Json | null
          primary_partner?: string | null
          secondary_partner?: string | null
          states?: string[] | null
        }
        Update: {
          areas?: string[]
          created_at?: string | null
          display_order?: number | null
          estimated_days_max?: number | null
          estimated_days_min?: number | null
          express_available?: boolean | null
          express_days_max?: number | null
          express_days_min?: number | null
          express_rate?: number | null
          flat_rate?: number
          free_delivery_threshold?: number | null
          id?: string
          is_active?: boolean | null
          lgas?: Json | null
          name?: string
          partner_schedule?: Json | null
          primary_partner?: string | null
          secondary_partner?: string | null
          states?: string[] | null
        }
        Relationships: []
      }
      shop_sections: {
        Row: {
          bundles_display_order: number | null
          bundles_is_visible: boolean
          created_at: string
          display_order: number
          filter_value: string | null
          id: string
          is_visible: boolean
          is_visible_on_all: boolean
          is_visible_on_baby: boolean
          is_visible_on_mum: boolean
          label: string
          page_context: string
          section_key: string
          section_type: string
          see_all_label: string | null
          standalone_page_slug: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          bundles_display_order?: number | null
          bundles_is_visible?: boolean
          created_at?: string
          display_order?: number
          filter_value?: string | null
          id?: string
          is_visible?: boolean
          is_visible_on_all?: boolean
          is_visible_on_baby?: boolean
          is_visible_on_mum?: boolean
          label: string
          page_context?: string
          section_key: string
          section_type: string
          see_all_label?: string | null
          standalone_page_slug?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          bundles_display_order?: number | null
          bundles_is_visible?: boolean
          created_at?: string
          display_order?: number
          filter_value?: string | null
          id?: string
          is_visible?: boolean
          is_visible_on_all?: boolean
          is_visible_on_baby?: boolean
          is_visible_on_mum?: boolean
          label?: string
          page_context?: string
          section_key?: string
          section_type?: string
          see_all_label?: string | null
          standalone_page_slug?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      spend_threshold_discounts: {
        Row: {
          created_at: string | null
          discount_percent: number
          display_order: number | null
          id: string
          is_active: boolean | null
          max_discount_amount: number | null
          name: string
          threshold_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          discount_percent: number
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          max_discount_amount?: number | null
          name: string
          threshold_amount: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          discount_percent?: number
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          max_discount_amount?: number | null
          name?: string
          threshold_amount?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      spend_thresholds: {
        Row: {
          amount: number
          applies_to_zones: string[] | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          label: string
          reward_description: string | null
          threshold_type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          applies_to_zones?: string[] | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          label: string
          reward_description?: string | null
          threshold_type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          applies_to_zones?: string[] | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          label?: string
          reward_description?: string | null
          threshold_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      stock_notifications: {
        Row: {
          brand_id: string | null
          created_at: string | null
          email: string
          id: string
          notified: boolean | null
          product_id: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          notified?: boolean | null
          product_id: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          notified?: boolean | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_notifications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_notifications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_items: {
        Row: {
          added_at: string | null
          brand_id: string
          frequency: string
          id: string
          is_active: boolean
          next_charge_date: string | null
          notes: string | null
          product_id: string
          quantity: number
          subscription_id: string
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          added_at?: string | null
          brand_id: string
          frequency?: string
          id?: string
          is_active?: boolean
          next_charge_date?: string | null
          notes?: string | null
          product_id: string
          quantity?: number
          subscription_id: string
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          added_at?: string | null
          brand_id?: string
          frequency?: string
          id?: string
          is_active?: boolean
          next_charge_date?: string | null
          notes?: string | null
          product_id?: string
          quantity?: number
          subscription_id?: string
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_items_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_orders: {
        Row: {
          charge_amount: number | null
          created_at: string | null
          cycle_number: number
          failure_reason: string | null
          id: string
          order_id: string | null
          paystack_reference: string | null
          scheduled_date: string
          skip_reason: string | null
          status: string
          subscription_id: string
          updated_at: string | null
        }
        Insert: {
          charge_amount?: number | null
          created_at?: string | null
          cycle_number: number
          failure_reason?: string | null
          id?: string
          order_id?: string | null
          paystack_reference?: string | null
          scheduled_date: string
          skip_reason?: string | null
          status?: string
          subscription_id: string
          updated_at?: string | null
        }
        Update: {
          charge_amount?: number | null
          created_at?: string | null
          cycle_number?: number
          failure_reason?: string | null
          id?: string
          order_id?: string | null
          paystack_reference?: string | null
          scheduled_date?: string
          skip_reason?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "subscription_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "subscription_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "subscription_orders_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_settings: {
        Row: {
          description: string | null
          id: string
          label: string
          setting_key: string
          setting_value: string
          updated_at: string | null
          updated_by: string | null
          value_type: string
        }
        Insert: {
          description?: string | null
          id?: string
          label: string
          setting_key: string
          setting_value: string
          updated_at?: string | null
          updated_by?: string | null
          value_type?: string
        }
        Update: {
          description?: string | null
          id?: string
          label?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string | null
          updated_by?: string | null
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancellation_effective_after_cycle: number | null
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          cancelled_at: string | null
          consent_confirmed_at: string | null
          consent_ip: string | null
          created_at: string | null
          customer_email: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          cycle_size: number
          deliveries_remaining: number
          delivery_address: string
          delivery_city: string
          delivery_day: string
          delivery_state: string
          discount_pct: number
          edit_deadline: string | null
          free_delivery: boolean
          frequency: string
          frequency_days: number
          id: string
          last_fulfilled_at: string | null
          last_renewal_error: string | null
          max_deliveries: number
          min_cycles: number
          next_charge_date: string
          next_retry_date: string | null
          next_shipment_date: string | null
          notes: string | null
          paused_until: string | null
          paystack_authorization_code: string | null
          paystack_card_brand: string | null
          paystack_card_last4: string | null
          paystack_customer_code: string | null
          paystack_email_token: string | null
          paystack_plan_code: string | null
          paystack_reference: string | null
          paystack_subscription_code: string | null
          price_locked_date: string
          renewal_retry_count: number
          start_date: string
          status: string
          total_cycles: number
          total_deliveries_paid: number
          updated_at: string | null
        }
        Insert: {
          cancellation_effective_after_cycle?: number | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancelled_at?: string | null
          consent_confirmed_at?: string | null
          consent_ip?: string | null
          created_at?: string | null
          customer_email: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          cycle_size?: number
          deliveries_remaining?: number
          delivery_address: string
          delivery_city: string
          delivery_day: string
          delivery_state?: string
          discount_pct?: number
          edit_deadline?: string | null
          free_delivery?: boolean
          frequency: string
          frequency_days?: number
          id?: string
          last_fulfilled_at?: string | null
          last_renewal_error?: string | null
          max_deliveries?: number
          min_cycles?: number
          next_charge_date: string
          next_retry_date?: string | null
          next_shipment_date?: string | null
          notes?: string | null
          paused_until?: string | null
          paystack_authorization_code?: string | null
          paystack_card_brand?: string | null
          paystack_card_last4?: string | null
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_plan_code?: string | null
          paystack_reference?: string | null
          paystack_subscription_code?: string | null
          price_locked_date?: string
          renewal_retry_count?: number
          start_date?: string
          status?: string
          total_cycles?: number
          total_deliveries_paid?: number
          updated_at?: string | null
        }
        Update: {
          cancellation_effective_after_cycle?: number | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancelled_at?: string | null
          consent_confirmed_at?: string | null
          consent_ip?: string | null
          created_at?: string | null
          customer_email?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          cycle_size?: number
          deliveries_remaining?: number
          delivery_address?: string
          delivery_city?: string
          delivery_day?: string
          delivery_state?: string
          discount_pct?: number
          edit_deadline?: string | null
          free_delivery?: boolean
          frequency?: string
          frequency_days?: number
          id?: string
          last_fulfilled_at?: string | null
          last_renewal_error?: string | null
          max_deliveries?: number
          min_cycles?: number
          next_charge_date?: string
          next_retry_date?: string | null
          next_shipment_date?: string | null
          notes?: string | null
          paused_until?: string | null
          paystack_authorization_code?: string | null
          paystack_card_brand?: string | null
          paystack_card_last4?: string | null
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_plan_code?: string | null
          paystack_reference?: string | null
          paystack_subscription_code?: string | null
          price_locked_date?: string
          renewal_retry_count?: number
          start_date?: string
          status?: string
          total_cycles?: number
          total_deliveries_paid?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_account_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_settings: {
        Row: {
          applicable_categories: string[] | null
          applies_to: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_included_in_price: boolean | null
          name: string
          rate: number
        }
        Insert: {
          applicable_categories?: string[] | null
          applies_to?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_included_in_price?: boolean | null
          name: string
          rate: number
        }
        Update: {
          applicable_categories?: string[] | null
          applies_to?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_included_in_price?: boolean | null
          name?: string
          rate?: number
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          customer_city: string
          customer_initial: string | null
          customer_location: string | null
          customer_name: string
          deleted_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_verified_purchase: boolean | null
          product_context: string | null
          quote: string
          rating: number | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          customer_city: string
          customer_initial?: string | null
          customer_location?: string | null
          customer_name: string
          deleted_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_verified_purchase?: boolean | null
          product_context?: string | null
          quote: string
          rating?: number | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          customer_city?: string
          customer_initial?: string | null
          customer_location?: string | null
          customer_name?: string
          deleted_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_verified_purchase?: boolean | null
          product_context?: string | null
          quote?: string
          rating?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      traffic_sources: {
        Row: {
          campaign: string | null
          channel_group: string | null
          created_at: string | null
          date: string
          id: string
          medium: string | null
          order_count: number | null
          revenue: number | null
          session_count: number | null
          source: string
        }
        Insert: {
          campaign?: string | null
          channel_group?: string | null
          created_at?: string | null
          date: string
          id?: string
          medium?: string | null
          order_count?: number | null
          revenue?: number | null
          session_count?: number | null
          source: string
        }
        Update: {
          campaign?: string | null
          channel_group?: string | null
          created_at?: string | null
          date?: string
          id?: string
          medium?: string | null
          order_count?: number | null
          revenue?: number | null
          session_count?: number | null
          source?: string
        }
        Relationships: []
      }
      trust_signals: {
        Row: {
          created_at: string | null
          display_order: number | null
          icon: string
          id: string
          is_active: boolean | null
          label: string
          sublabel: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          icon?: string
          id?: string
          is_active?: boolean | null
          label: string
          sublabel?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          icon?: string
          id?: string
          is_active?: boolean | null
          label?: string
          sublabel?: string | null
        }
        Relationships: []
      }
      vendors: {
        Row: {
          contact_person: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      admin_order_item_profit_view: {
        Row: {
          brand_name: string | null
          color: string | null
          cost_price: number | null
          has_cogs: boolean | null
          item_created_at: string | null
          item_id: string | null
          line_cost: number | null
          line_margin: number | null
          line_margin_pct: number | null
          line_revenue: number | null
          order_date: string | null
          order_id: string | null
          order_number: string | null
          product_name: string | null
          quantity: number | null
          size: string | null
          unit_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      admin_order_profit_view: {
        Row: {
          cancelled_at: string | null
          cash_profit: number | null
          cash_profit_pct: number | null
          cogs_quality_pct: number | null
          created_at: string | null
          customer_delivery_paid: number | null
          customer_email: string | null
          customer_name: string | null
          delivery_city: string | null
          delivery_cost: number | null
          delivery_state: string | null
          discount_amount: number | null
          gift_wrap_fee: number | null
          gross_margin: number | null
          gross_margin_pct: number | null
          gross_revenue: number | null
          items_cogs: number | null
          items_revenue: number | null
          items_with_cogs: number | null
          net_revenue: number | null
          order_id: string | null
          order_number: string | null
          order_status: string | null
          packaging_cost: number | null
          payment_method: string | null
          payment_status: string | null
          paystack_fee: number | null
          profit_status: string | null
          refund_amount: number | null
          service_fee: number | null
          total_costs: number | null
          total_items: number | null
        }
        Relationships: []
      }
      admin_quotes_summary: {
        Row: {
          accepted_at: string | null
          bypass_delivery_threshold: boolean | null
          bypass_spend_threshold: boolean | null
          converted_order_id: string | null
          converted_order_number: string | null
          converted_order_payment_status: string | null
          created_at: string | null
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          customer_notes: string | null
          customer_phone: string | null
          delivery_address: string | null
          delivery_city: string | null
          delivery_fee_override: number | null
          delivery_state: string | null
          discount_amount: number | null
          discount_reason: string | null
          estimated_delivery_fee: number | null
          expires_at: string | null
          id: string | null
          internal_notes: string | null
          is_expired_pending: boolean | null
          item_count: number | null
          last_viewed_at: string | null
          quote_number: string | null
          sent_at: string | null
          service_fee: number | null
          share_token: string | null
          status: string | null
          subtotal: number | null
          total: number | null
          updated_at: string | null
          view_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "quotes_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "quotes_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_returns_view: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string | null
          order_id: string | null
          order_number: string | null
          order_status: string | null
          order_total: number | null
          payment_status: string | null
          refund_amount: number | null
          refund_issued: boolean | null
          refunded_at: string | null
          rejection_reason: string | null
          return_reason: string | null
          return_reason_notes: string | null
          return_type: string | null
          status: string | null
          stock_restored: boolean | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_returns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_profit_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_lines_report"
            referencedColumns: ["order_uuid"]
          },
          {
            foreignKeyName: "order_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_report"
            referencedColumns: ["order_uuid"]
          },
        ]
      }
      brands_public: {
        Row: {
          brand_name: string | null
          compare_at_price: number | null
          created_at: string | null
          diaper_type: string | null
          display_order: number | null
          id: string | null
          image_url: string | null
          images: string[] | null
          in_stock: boolean | null
          is_default_for_tier: boolean | null
          logo_url: string | null
          pack_count: number | null
          price: number | null
          product_id: string | null
          size_variant: string | null
          sku: string | null
          stock_quantity: number | null
          thumbnail_url: string | null
          tier: string | null
          updated_at: string | null
          variant_type: string | null
          weight_range_kg: string | null
        }
        Insert: {
          brand_name?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          diaper_type?: string | null
          display_order?: number | null
          id?: string | null
          image_url?: string | null
          images?: string[] | null
          in_stock?: boolean | null
          is_default_for_tier?: boolean | null
          logo_url?: string | null
          pack_count?: number | null
          price?: number | null
          product_id?: string | null
          size_variant?: string | null
          sku?: string | null
          stock_quantity?: number | null
          thumbnail_url?: string | null
          tier?: string | null
          updated_at?: string | null
          variant_type?: string | null
          weight_range_kg?: string | null
        }
        Update: {
          brand_name?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          diaper_type?: string | null
          display_order?: number | null
          id?: string | null
          image_url?: string | null
          images?: string[] | null
          in_stock?: boolean | null
          is_default_for_tier?: boolean | null
          logo_url?: string | null
          pack_count?: number | null
          price?: number | null
          product_id?: string | null
          size_variant?: string | null
          sku?: string | null
          stock_quantity?: number | null
          thumbnail_url?: string | null
          tier?: string | null
          updated_at?: string | null
          variant_type?: string | null
          weight_range_kg?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_account_view: {
        Row: {
          account_created_at: string | null
          credits_available: number | null
          delivery_address: string | null
          delivery_area: string | null
          delivery_state: string | null
          email: string | null
          full_name: string | null
          id: string | null
          last_login_at: string | null
          last_order_at: string | null
          phone: string | null
          referral_code: string | null
          referral_credit_per_use: number | null
          referral_discount_amount: number | null
          referral_uses: number | null
          total_credits_earned: number | null
          total_orders: number | null
          total_spent: number | null
          whatsapp_number: string | null
        }
        Relationships: []
      }
      customer_report: {
        Row: {
          Acquisition_Channel: string | null
          Customer_ID: string | null
          Customer_Since: string | null
          Email: string | null
          First_Purchase_Date: string | null
          Last_Order_Date: string | null
          Phone: string | null
          Primary_Country: string | null
          Primary_Device: string | null
          State: string | null
          Total_Orders: number | null
          Total_Spent: number | null
        }
        Insert: {
          Acquisition_Channel?: never
          Customer_ID?: string | null
          Customer_Since?: string | null
          Email?: string | null
          First_Purchase_Date?: never
          Last_Order_Date?: string | null
          Phone?: string | null
          Primary_Country?: never
          Primary_Device?: never
          State?: string | null
          Total_Orders?: number | null
          Total_Spent?: number | null
        }
        Update: {
          Acquisition_Channel?: never
          Customer_ID?: string | null
          Customer_Since?: string | null
          Email?: string | null
          First_Purchase_Date?: never
          Last_Order_Date?: string | null
          Phone?: string | null
          Primary_Country?: never
          Primary_Device?: never
          State?: string | null
          Total_Orders?: number | null
          Total_Spent?: number | null
        }
        Relationships: []
      }
      finance_pl_summary: {
        Row: {
          gross_profit: number | null
          gross_revenue: number | null
          month: number | null
          month_start: string | null
          net_margin_pct: number | null
          net_profit: number | null
          total_cogs: number | null
          total_delivery_charged: number | null
          total_delivery_cost: number | null
          total_expenses: number | null
          total_gift_wrap_revenue: number | null
          total_orders: number | null
          total_packaging_cost: number | null
          total_payroll: number | null
          total_paystack_fees: number | null
          year: number | null
        }
        Relationships: []
      }
      hr_analytics: {
        Row: {
          active_headcount: number | null
          contract_count: number | null
          current_month_net_payroll_naira: number | null
          current_month_total_cost_naira: number | null
          full_time_count: number | null
          intern_count: number | null
          leave_requests_this_month: number | null
          new_hires_this_month: number | null
          on_leave_count: number | null
          on_probation_count: number | null
          part_time_count: number | null
          pending_leave_requests: number | null
          suspended_count: number | null
          terminated_count: number | null
          total_documents: number | null
          total_employees: number | null
        }
        Relationships: []
      }
      hr_employee_performance: {
        Row: {
          avg_days_to_complete: number | null
          cancelled_tasks: number | null
          completed_tasks: number | null
          completed_this_month: number | null
          completion_rate_pct: number | null
          department_id: string | null
          employee_code: string | null
          employee_id: string | null
          full_name: string | null
          job_title: string | null
          late_completions: number | null
          on_time_completions: number | null
          on_time_rate_pct: number | null
          overdue_tasks: number | null
          pending_tasks: number | null
          performance_score: number | null
          tasks_this_month: number | null
          total_tasks: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_headcount_by_department: {
        Row: {
          active: number | null
          department: string | null
          monthly_gross_naira: number | null
          on_leave: number | null
          terminated: number | null
          total: number | null
        }
        Relationships: []
      }
      marketing_customer_acquisition: {
        Row: {
          avg_lifetime_value_naira: number | null
          channel: string | null
          customers: number | null
          customers_who_ordered: number | null
          order_conversion_pct: number | null
          repeat_customers: number | null
        }
        Relationships: []
      }
      marketing_daily_funnel: {
        Row: {
          all_orders: number | null
          cart_sessions: number | null
          checkouts: number | null
          day: string | null
          paid_orders: number | null
          quiz_completions: number | null
          quiz_starts: number | null
          sessions: number | null
        }
        Relationships: []
      }
      marketing_device_breakdown: {
        Row: {
          device_type: string | null
          events: number | null
          pct: number | null
          sessions: number | null
        }
        Relationships: []
      }
      marketing_funnel_with_quiz: {
        Row: {
          all_orders: number | null
          checkout_to_order_pct: number | null
          checkouts: number | null
          order_to_paid_pct: number | null
          overall_conversion_pct: number | null
          paid_orders: number | null
          quiz_sessions: number | null
          quiz_to_checkout_pct: number | null
          revenue_naira: number | null
        }
        Relationships: []
      }
      marketing_funnel_without_quiz: {
        Row: {
          add_to_carts: number | null
          all_orders: number | null
          cart_to_checkout_pct: number | null
          checkout_to_order_pct: number | null
          checkouts: number | null
          order_to_paid_pct: number | null
          overall_conversion_pct: number | null
          paid_orders: number | null
          revenue_naira: number | null
          sessions: number | null
          sessions_to_cart_pct: number | null
        }
        Relationships: []
      }
      marketing_referral_performance: {
        Row: {
          code: string | null
          credits_applied: number | null
          credits_issued: number | null
          credits_pending: number | null
          discount_amount: number | null
          is_active: boolean | null
          referrer_credit: number | null
          referrer_email: string | null
          times_used: number | null
          total_credit_earned: number | null
        }
        Relationships: []
      }
      marketing_traffic_sources: {
        Row: {
          medium: string | null
          sessions: number | null
          source: string | null
          unique_sessions: number | null
        }
        Relationships: []
      }
      marketing_utm_performance: {
        Row: {
          checkouts: number | null
          orders: number | null
          quiz_completions: number | null
          quiz_starts: number | null
          sessions: number | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Relationships: []
      }
      order_lines_report: {
        Row: {
          Attributed_Channel: string | null
          Brand_Name: string | null
          Category: string | null
          COGS_Net_NGN: number | null
          Customer_Email: string | null
          Customer_ID: string | null
          Discount_NGN: number | null
          Gross_Sales_NGN: number | null
          Net_Sales_NGN: number | null
          New_vs_Returning: string | null
          Order_Date: string | null
          Order_ID: string | null
          order_item_uuid: string | null
          Order_Status: string | null
          order_uuid: string | null
          Payment_Method: string | null
          Payment_Status: string | null
          Product_Name: string | null
          Qty: number | null
          Returns_NGN: number | null
          Shipping_Alloc_NGN: number | null
          SKU: string | null
          State: string | null
          Tax_NGN: number | null
          Unit_Price_NGN: number | null
        }
        Relationships: []
      }
      order_lines_summary: {
        Row: {
          attributed_channel: string | null
          gross_profit: number | null
          product_category: string | null
          report_date: string | null
          total_cogs: number | null
          total_discounts: number | null
          total_gross_sales: number | null
          total_line_items: number | null
          total_net_sales: number | null
          total_returns: number | null
          total_shipping_alloc: number | null
          total_tax: number | null
          total_units: number | null
          unique_customers: number | null
        }
        Relationships: []
      }
      orders_report: {
        Row: {
          AOV_NGN: number | null
          Attributed_Channel: string | null
          COGS_Net_NGN: number | null
          Customer_Email: string | null
          Customer_ID: string | null
          Customer_Name: string | null
          Customer_Phone: string | null
          Delivery_Fee_NGN: number | null
          Discount_NGN: number | null
          Gift_Wrapping: boolean | null
          Gross_Margin_Pct: number | null
          Gross_Profit_NGN: number | null
          Gross_Sales_NGN: number | null
          Is_Quiz_Order: boolean | null
          Items: number | null
          Net_Sales_NGN: number | null
          New_vs_Returning: string | null
          Order_Date: string | null
          Order_Discount_NGN: number | null
          Order_ID: string | null
          Order_Status: string | null
          Order_Subtotal_NGN: number | null
          Order_Total_NGN: number | null
          order_uuid: string | null
          Payment_Method: string | null
          Payment_Status: string | null
          Refund_NGN: number | null
          Returns_NGN: number | null
          Service_Fee_NGN: number | null
          Shipping_NGN: number | null
          State: string | null
          Tax_NGN: number | null
          Total_Units: number | null
        }
        Relationships: []
      }
      orders_report_summary: {
        Row: {
          attributed_channel: string | null
          avg_order_value: number | null
          delivery_state: string | null
          gross_margin_pct: number | null
          payment_method: string | null
          report_date: string | null
          total_cogs: number | null
          total_discounts: number | null
          total_gross_profit: number | null
          total_gross_sales: number | null
          total_line_items: number | null
          total_net_sales: number | null
          total_orders: number | null
          total_returns: number | null
          total_shipping: number | null
          total_tax: number | null
          total_units: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_order_for_picking: { Args: { p_order_id: string }; Returns: Json }
      apply_referral_credit: {
        Args: {
          p_credit_amount: number
          p_order_id: string
          p_referrer_email: string
        }
        Returns: Json
      }
      apply_referral_redemption: {
        Args: {
          p_discount_amount: number
          p_order_id: string
          p_redeemer_email: string
          p_redeemer_phone: string
          p_referral_code_id: string
        }
        Returns: Json
      }
      calculate_employee_payroll: {
        Args: { p_bonus?: number; p_employee_id: string }
        Returns: Json
      }
      calculate_paye_annual: {
        Args: { p_annual_taxable_naira: number }
        Returns: number
      }
      calculate_subscription_total: {
        Args: { p_subscription_id: string }
        Returns: Json
      }
      calculate_tax_position: {
        Args: { p_month?: number; p_year?: number }
        Returns: Json
      }
      check_realtime_access: {
        Args: { channel_name: string }
        Returns: boolean
      }
      check_stock_availability: { Args: { p_items: Json }; Returns: Json }
      complete_order_picking: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      count_working_days: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: number
      }
      create_shared_cart: { Args: { p_items: Json }; Returns: string }
      duplicate_quote: {
        Args: { p_source_quote_id: string }
        Returns: {
          new_quote_id: string
          new_quote_number: string
        }[]
      }
      generate_compliance_notifications: { Args: never; Returns: undefined }
      generate_employment_letter_data: {
        Args: { p_employee_id: string }
        Returns: Json
      }
      generate_invoice_from_order: {
        Args: { p_generated_by?: string; p_order_id: string }
        Returns: Json
      }
      generate_invoice_number: { Args: never; Returns: string }
      generate_order_number: { Args: never; Returns: string }
      generate_quiz_story:
        | {
            Args: {
              p_budget_tier: string
              p_delivery_method?: string
              p_first_baby?: boolean
              p_gender: string
              p_gift_occasion?: string
              p_gift_relationship?: string
              p_gift_wrap?: boolean
              p_hospital_type?: string
              p_multiples?: number
              p_product_count?: number
              p_shopper_type: string
            }
            Returns: string
          }
        | {
            Args: {
              p_budget_tier: string
              p_delivery_method?: string
              p_first_baby?: boolean
              p_gender: string
              p_gift_occasion?: string
              p_gift_relationship?: string
              p_gift_wrap?: boolean
              p_hospital_type?: string
              p_multiples?: number
              p_product_count?: number
              p_scope?: string
              p_shopper_type: string
              p_stage?: string
            }
            Returns: string
          }
      generate_referral_code: { Args: { p_order_id: string }; Returns: Json }
      get_admin_nav: { Args: never; Returns: Json }
      get_admin_orders: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_payment_status?: string
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      get_courier_assignment: {
        Args: {
          p_bundle_tier?: string
          p_daily_order_count?: number
          p_delivery_city: string
          p_delivery_state: string
          p_order_day?: string
          p_order_subtotal?: number
          p_order_weight_kg?: number
        }
        Returns: Json
      }
      get_daily_task_summary: {
        Args: never
        Returns: {
          done_today: Json
          manager_email: string
          manager_id: string
          manager_name: string
          overdue: Json
          still_pending: Json
        }[]
      }
      get_dashboard_metrics: { Args: never; Returns: Json }
      get_default_service_fee: { Args: never; Returns: number }
      get_delivery_fee: {
        Args: { p_city: string; p_state: string; p_subtotal: number }
        Returns: {
          days_max: number
          days_min: number
          fee: number
          zone: string
        }[]
      }
      get_gift_box_price: { Args: { p_gift_box_id: string }; Returns: Json }
      get_gift_category_products: {
        Args: { p_budget_amount?: number; p_category: string }
        Returns: Json
      }
      get_quote_by_share_token: {
        Args: { p_share_token: string }
        Returns: {
          created_at: string
          customer_name: string
          customer_notes: string
          delivery_city: string
          delivery_fee_override: number
          delivery_state: string
          discount_amount: number
          discount_reason: string
          estimated_delivery_fee: number
          expires_at: string
          id: string
          is_expired: boolean
          quote_number: string
          service_fee: number
          status: string
          subtotal: number
          total: number
        }[]
      }
      get_quote_items_by_share_token: {
        Args: { p_share_token: string }
        Returns: {
          brand_id: string
          brand_name: string
          color: string
          current_image_url: string
          current_in_stock: boolean
          display_order: number
          id: string
          line_total: number
          product_id: string
          product_name: string
          quantity: number
          size: string
          unit_price: number
        }[]
      }
      get_shared_cart: { Args: { p_share_token: string }; Returns: Json }
      get_shop_page: { Args: { p_shop: string }; Returns: Json }
      get_subscription_settings: { Args: never; Returns: Json }
      get_user_permissions: {
        Args: { p_target_user_id: string }
        Returns: Json
      }
      grant_admin_permission: {
        Args: {
          p_action: string
          p_granted?: boolean
          p_module: string
          p_target_user_id: string
        }
        Returns: Json
      }
      has_admin_permission: {
        Args: { p_action?: string; p_section: string }
        Returns: boolean
      }
      initiate_return:
        | {
            Args: {
              p_order_id: string
              p_reason: string
              p_return_type?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_admin_notes?: string
              p_items_returned?: Json
              p_order_id: string
              p_refund_amount?: number
              p_return_reason: string
              p_return_type?: string
            }
            Returns: Json
          }
      is_admin: { Args: never; Returns: boolean }
      is_admin_user: { Args: never; Returns: boolean }
      is_sensitive_realtime_topic: { Args: { topic: string }; Returns: boolean }
      link_my_employee_account: { Args: never; Returns: Json }
      link_order_to_quote: {
        Args: { p_order_id: string; p_share_token: string }
        Returns: Json
      }
      mark_quiz_lead_purchased: {
        Args: {
          p_order_amount?: number
          p_order_id: string
          p_session_id: string
        }
        Returns: boolean
      }
      next_delivery_date: {
        Args: { p_delivery_day: string; p_from_date?: string }
        Returns: string
      }
      orders_paid_only_restricted: { Args: never; Returns: boolean }
      process_admin_approval: {
        Args: { p_approved: boolean; p_note?: string; p_request_id: string }
        Returns: Json
      }
      process_annual_leave_carryover: {
        Args: { p_from_year?: number; p_max_carryover?: number }
        Returns: Json
      }
      process_recurring_expenses: { Args: never; Returns: Json }
      record_quote_view: { Args: { p_share_token: string }; Returns: undefined }
      refresh_maternity_bundle_prices: { Args: never; Returns: Json }
      request_admin_action: {
        Args: {
          p_action: string
          p_description?: string
          p_proposed_data?: Json
          p_record_id?: string
          p_target_table: string
        }
        Returns: Json
      }
      run_push_gift_recommendation: {
        Args: { p_budget_tier: string; p_category: string; p_timing: string }
        Returns: Json
      }
      run_quiz_recommendation:
        | {
            Args: {
              p_budget_tier: string
              p_delivery_method?: string
              p_first_baby?: boolean
              p_gender?: string
              p_gift_relationship?: string
              p_hospital_type?: string
              p_is_gift?: boolean
              p_multiples?: number
              p_scope: string
              p_stage: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_budget_amount?: number
              p_budget_tier: string
              p_delivery_method?: string
              p_first_baby?: boolean
              p_gender?: string
              p_gift_relationship?: string
              p_hospital_type?: string
              p_is_gift?: boolean
              p_multiples?: number
              p_scope: string
              p_stage: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_budget_tier: string
              p_delivery_method: string
              p_first_baby?: boolean
              p_gender?: string
              p_gift_for?: string
              p_hospital_type: string
              p_multiples?: number
              p_scope: string
              p_shopper_type?: string
              p_stage: string
            }
            Returns: Json
          }
      save_quiz_lead: {
        Args: {
          p_baby_gender?: string
          p_budget_tier?: string
          p_dad_purpose?: string
          p_delivery_method?: string
          p_first_baby?: boolean
          p_full_answers?: Json
          p_gift_message?: string
          p_gift_wrap?: boolean
          p_hospital_type?: string
          p_multiples?: string
          p_page_url?: string
          p_push_gift_budget?: string
          p_push_gift_category?: string
          p_push_gift_timing?: string
          p_referral_source?: string
          p_scope?: string
          p_session_id: string
          p_shopper_type?: string
          p_stage?: string
          p_whatsapp_number?: string
        }
        Returns: Json
      }
      search_products: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      set_session_context: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      stock_notification_rate_ok: {
        Args: { p_email: string }
        Returns: boolean
      }
      validate_coupon: {
        Args: { coupon_code: string; order_amount: number }
        Returns: Json
      }
      validate_preview_token: { Args: { p_token: string }; Returns: Json }
      validate_referral_code:
        | {
            Args: { p_code: string }
            Returns: {
              code: string
              id: string
              is_active: boolean
            }[]
          }
        | {
            Args: {
              p_code: string
              p_order_amount: number
              p_redeemer_email: string
              p_redeemer_phone: string
            }
            Returns: Json
          }
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
