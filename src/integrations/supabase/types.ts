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
      ab_test_events: {
        Row: {
          ab_test_id: string | null
          created_at: string
          event_type: string | null
          id: string
          metadata: Json
          value: number | null
          variant: string | null
          visitor_id: string | null
        }
        Insert: {
          ab_test_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          metadata?: Json
          value?: number | null
          variant?: string | null
          visitor_id?: string | null
        }
        Update: {
          ab_test_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          metadata?: Json
          value?: number | null
          variant?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      ab_tests: {
        Row: {
          checkouts_a: number
          checkouts_b: number
          confidence_level: number
          conversions_a: number
          conversions_b: number
          created_at: string
          id: string
          impressions_a: number
          impressions_b: number
          is_active: boolean
          name: string | null
          product_id: string | null
          revenue_a: number
          revenue_b: number
          traffic_split: number
          updated_at: string
          variant_a: Json | null
          variant_b: Json | null
          winner: string | null
        }
        Insert: {
          checkouts_a?: number
          checkouts_b?: number
          confidence_level?: number
          conversions_a?: number
          conversions_b?: number
          created_at?: string
          id?: string
          impressions_a?: number
          impressions_b?: number
          is_active?: boolean
          name?: string | null
          product_id?: string | null
          revenue_a?: number
          revenue_b?: number
          traffic_split?: number
          updated_at?: string
          variant_a?: Json | null
          variant_b?: Json | null
          winner?: string | null
        }
        Update: {
          checkouts_a?: number
          checkouts_b?: number
          confidence_level?: number
          conversions_a?: number
          conversions_b?: number
          created_at?: string
          id?: string
          impressions_a?: number
          impressions_b?: number
          is_active?: boolean
          name?: string | null
          product_id?: string | null
          revenue_a?: number
          revenue_b?: number
          traffic_split?: number
          updated_at?: string
          variant_a?: Json | null
          variant_b?: Json | null
          winner?: string | null
        }
        Relationships: []
      }
      bot_blocks: {
        Row: {
          bot_name: string | null
          created_at: string
          id: string
          ip: string | null
          path: string | null
          reason: string
          user_agent: string | null
        }
        Insert: {
          bot_name?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          path?: string | null
          reason?: string
          user_agent?: string | null
        }
        Update: {
          bot_name?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          path?: string | null
          reason?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      company_info: {
        Row: {
          address_line1: string | null
          business_hours: string | null
          city: string | null
          company_name: string
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          free_shipping_threshold: number | null
          id: string
          legal_name: string | null
          postal_code: string | null
          province: string | null
          rea_number: string | null
          return_window_days: number
          social_links: Json | null
          support_email: string | null
          tax_code: string | null
          updated_at: string
          vat_number: string | null
          whatsapp: string | null
        }
        Insert: {
          address_line1?: string | null
          business_hours?: string | null
          city?: string | null
          company_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          free_shipping_threshold?: number | null
          id?: string
          legal_name?: string | null
          postal_code?: string | null
          province?: string | null
          rea_number?: string | null
          return_window_days?: number
          social_links?: Json | null
          support_email?: string | null
          tax_code?: string | null
          updated_at?: string
          vat_number?: string | null
          whatsapp?: string | null
        }
        Update: {
          address_line1?: string | null
          business_hours?: string | null
          city?: string | null
          company_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          free_shipping_threshold?: number | null
          id?: string
          legal_name?: string | null
          postal_code?: string | null
          province?: string | null
          rea_number?: string | null
          return_window_days?: number
          social_links?: Json | null
          support_email?: string | null
          tax_code?: string | null
          updated_at?: string
          vat_number?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      footer_config: {
        Row: {
          badges: Json
          certifications: Json
          copyright_text: string | null
          courier_logo_height_desktop: number | null
          courier_logo_height_mobile: number | null
          couriers_custom: Json
          created_at: string
          footer_description: string | null
          id: string
          links: Json
          newsletter_enabled: boolean
          newsletter_subtitle: string | null
          newsletter_title: string | null
          payment_methods: Json
          payment_methods_custom: Json
          shipped_with_logos: Json
          updated_at: string
        }
        Insert: {
          badges?: Json
          certifications?: Json
          copyright_text?: string | null
          courier_logo_height_desktop?: number | null
          courier_logo_height_mobile?: number | null
          couriers_custom?: Json
          created_at?: string
          footer_description?: string | null
          id?: string
          links?: Json
          newsletter_enabled?: boolean
          newsletter_subtitle?: string | null
          newsletter_title?: string | null
          payment_methods?: Json
          payment_methods_custom?: Json
          shipped_with_logos?: Json
          updated_at?: string
        }
        Update: {
          badges?: Json
          certifications?: Json
          copyright_text?: string | null
          courier_logo_height_desktop?: number | null
          courier_logo_height_mobile?: number | null
          couriers_custom?: Json
          created_at?: string
          footer_description?: string | null
          id?: string
          links?: Json
          newsletter_enabled?: boolean
          newsletter_subtitle?: string | null
          newsletter_title?: string | null
          payment_methods?: Json
          payment_methods_custom?: Json
          shipped_with_logos?: Json
          updated_at?: string
        }
        Relationships: []
      }
      home_sections: {
        Row: {
          content: Json
          created_at: string
          data: Json
          enabled: boolean
          id: string
          is_active: boolean
          section_key: string
          sort_order: number
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          data?: Json
          enabled?: boolean
          id?: string
          is_active?: boolean
          section_key: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          data?: Json
          enabled?: boolean
          id?: string
          is_active?: boolean
          section_key?: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      legal_pages: {
        Row: {
          body_markdown: string | null
          created_at: string
          id: string
          is_published: boolean
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body_markdown?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body_markdown?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          ab_test_id: string | null
          bridge_shadow_map: Json
          bullets: Json
          category_id: string | null
          checkout_image_url: string | null
          compare_price: number | null
          cost_price: number | null
          created_at: string
          description_html: string | null
          description_long: string | null
          description_short: string | null
          id: string
          image_fit: string | null
          images: Json
          name: string
          og_image: string | null
          page_builder_data: Json | null
          price: number
          product_code: string | null
          quantity_breaks: Json
          seo_description: string | null
          seo_title: string | null
          shipping_returns_html: string | null
          shopify_handle: string | null
          shopify_target_stores: Json
          shopify_title_override: string | null
          show_discount_badge: boolean
          show_trending_badge: boolean
          sku: string | null
          slug: string
          sort_order: number
          status: string
          subtitle: string | null
          tags: Json
          trending_badge_label: string | null
          trust_badge_text: string | null
          updated_at: string
          variants: Json
        }
        Insert: {
          ab_test_id?: string | null
          bridge_shadow_map?: Json
          bullets?: Json
          category_id?: string | null
          checkout_image_url?: string | null
          compare_price?: number | null
          cost_price?: number | null
          created_at?: string
          description_html?: string | null
          description_long?: string | null
          description_short?: string | null
          id?: string
          image_fit?: string | null
          images?: Json
          name: string
          og_image?: string | null
          page_builder_data?: Json | null
          price?: number
          product_code?: string | null
          quantity_breaks?: Json
          seo_description?: string | null
          seo_title?: string | null
          shipping_returns_html?: string | null
          shopify_handle?: string | null
          shopify_target_stores?: Json
          shopify_title_override?: string | null
          show_discount_badge?: boolean
          show_trending_badge?: boolean
          sku?: string | null
          slug: string
          sort_order?: number
          status?: string
          subtitle?: string | null
          tags?: Json
          trending_badge_label?: string | null
          trust_badge_text?: string | null
          updated_at?: string
          variants?: Json
        }
        Update: {
          ab_test_id?: string | null
          bridge_shadow_map?: Json
          bullets?: Json
          category_id?: string | null
          checkout_image_url?: string | null
          compare_price?: number | null
          cost_price?: number | null
          created_at?: string
          description_html?: string | null
          description_long?: string | null
          description_short?: string | null
          id?: string
          image_fit?: string | null
          images?: Json
          name?: string
          og_image?: string | null
          page_builder_data?: Json | null
          price?: number
          product_code?: string | null
          quantity_breaks?: Json
          seo_description?: string | null
          seo_title?: string | null
          shipping_returns_html?: string | null
          shopify_handle?: string | null
          shopify_target_stores?: Json
          shopify_title_override?: string | null
          show_discount_badge?: boolean
          show_trending_badge?: boolean
          sku?: string | null
          slug?: string
          sort_order?: number
          status?: string
          subtitle?: string | null
          tags?: Json
          trending_badge_label?: string | null
          trust_badge_text?: string | null
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      rotation_log: {
        Row: {
          created_at: string
          from_revenue: number | null
          from_store_id: string | null
          id: string
          metadata: Json
          reason: string | null
          store_id: string | null
          to_revenue: number | null
          to_store_id: string | null
          trigger_type: string
        }
        Insert: {
          created_at?: string
          from_revenue?: number | null
          from_store_id?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          store_id?: string | null
          to_revenue?: number | null
          to_store_id?: string | null
          trigger_type?: string
        }
        Update: {
          created_at?: string
          from_revenue?: number | null
          from_store_id?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          store_id?: string | null
          to_revenue?: number | null
          to_store_id?: string | null
          trigger_type?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          bounce: boolean
          browser: string | null
          clicks: number
          converted: boolean
          created_at: string
          device_type: string | null
          events: Json
          id: string
          ip: string | null
          is_mobile: boolean
          landing_page: string | null
          last_activity: string | null
          pages_path: Json
          product_id: string | null
          referrer: string | null
          scroll_depth: number
          session_id: string
          time_on_page: number
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          bounce?: boolean
          browser?: string | null
          clicks?: number
          converted?: boolean
          created_at?: string
          device_type?: string | null
          events?: Json
          id?: string
          ip?: string | null
          is_mobile?: boolean
          landing_page?: string | null
          last_activity?: string | null
          pages_path?: Json
          product_id?: string | null
          referrer?: string | null
          scroll_depth?: number
          session_id: string
          time_on_page?: number
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          bounce?: boolean
          browser?: string | null
          clicks?: number
          converted?: boolean
          created_at?: string
          device_type?: string | null
          events?: Json
          id?: string
          ip?: string | null
          is_mobile?: boolean
          landing_page?: string | null
          last_activity?: string | null
          pages_path?: Json
          product_id?: string | null
          referrer?: string | null
          scroll_depth?: number
          session_id?: string
          time_on_page?: number
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          key: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          key: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          key?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: []
      }
      site_branding: {
        Row: {
          accent_color: string | null
          created_at: string
          default_product_tagline: string | null
          favicon_url: string | null
          header_tagline: string | null
          horizon_enabled: boolean
          horizon_logos: Json
          horizon_text: string | null
          id: string
          logo_dark_url: string | null
          logo_url: string | null
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          primary_color: string | null
          store_name: string
          top_banner_bg: string | null
          top_banner_enabled: boolean
          top_banner_fg: string | null
          top_banner_link: string | null
          top_banner_text: string | null
          twitter_handle: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          default_product_tagline?: string | null
          favicon_url?: string | null
          header_tagline?: string | null
          horizon_enabled?: boolean
          horizon_logos?: Json
          horizon_text?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          primary_color?: string | null
          store_name?: string
          top_banner_bg?: string | null
          top_banner_enabled?: boolean
          top_banner_fg?: string | null
          top_banner_link?: string | null
          top_banner_text?: string | null
          twitter_handle?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          default_product_tagline?: string | null
          favicon_url?: string | null
          header_tagline?: string | null
          horizon_enabled?: boolean
          horizon_logos?: Json
          horizon_text?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          primary_color?: string | null
          store_name?: string
          top_banner_bg?: string | null
          top_banner_enabled?: boolean
          top_banner_fg?: string | null
          top_banner_link?: string | null
          top_banner_text?: string | null
          twitter_handle?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      store_stats: {
        Row: {
          checkout_launches_24h: number
          created_at: string
          cvr_percentage: number
          date: string
          id: string
          shopify_daily_orders: number
          shopify_daily_revenue: number
          shopify_total_orders: number
          shopify_total_revenue: number
          store_id: string
        }
        Insert: {
          checkout_launches_24h?: number
          created_at?: string
          cvr_percentage?: number
          date?: string
          id?: string
          shopify_daily_orders?: number
          shopify_daily_revenue?: number
          shopify_total_orders?: number
          shopify_total_revenue?: number
          store_id: string
        }
        Update: {
          checkout_launches_24h?: number
          created_at?: string
          cvr_percentage?: number
          date?: string
          id?: string
          shopify_daily_orders?: number
          shopify_daily_revenue?: number
          shopify_total_orders?: number
          shopify_total_revenue?: number
          store_id?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          access_token_encrypted: string | null
          avg_latency_ms: number
          bridge_api_key_encrypted: string | null
          bridge_last_connected: string | null
          bridge_last_error: string | null
          bridge_last_sync: string | null
          bridge_site_url: string | null
          bridge_status: string | null
          cap_amount: number | null
          cap_window_days: number
          cap_window_revenue: number
          cap_window_start: string | null
          client_id: string | null
          client_secret_encrypted: string | null
          connected_at: string | null
          consecutive_errors: number
          country_rule: string
          created_at: string
          custom_threshold: number | null
          display_name: string | null
          health_status: string
          hmac_secret_encrypted: string | null
          id: string
          integration_type: string
          is_active: boolean
          is_current: boolean
          is_online: boolean
          last_health_check: string | null
          last_offline: string | null
          last_online: string | null
          last_ping_at: string | null
          last_webhook_at: string | null
          lovable_sync_api_key_encrypted: string | null
          lovable_sync_default_currency: string | null
          lovable_sync_default_locale: string | null
          lovable_sync_enabled: boolean
          lovable_sync_hmac_secret_encrypted: string | null
          lovable_sync_last_error: string | null
          lovable_sync_last_push: string | null
          lovable_sync_status: string | null
          lovable_sync_store_ref: string | null
          lovable_sync_url: string | null
          needs_reauth: boolean
          oauth_scopes: string | null
          offline_reason: string | null
          product_push_url: string | null
          proxy_enabled: boolean
          proxy_host: string | null
          proxy_port: number | null
          proxy_type: string
          recent_failures: number
          registered_webhook_topics: Json
          rotation_threshold: number
          shadow_checkout_enabled: boolean
          shop_domain: string
          sort_order: number
          token_status: string
          updated_at: string
          webhook_secret_encrypted: string | null
          webhooks_registered_at: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          avg_latency_ms?: number
          bridge_api_key_encrypted?: string | null
          bridge_last_connected?: string | null
          bridge_last_error?: string | null
          bridge_last_sync?: string | null
          bridge_site_url?: string | null
          bridge_status?: string | null
          cap_amount?: number | null
          cap_window_days?: number
          cap_window_revenue?: number
          cap_window_start?: string | null
          client_id?: string | null
          client_secret_encrypted?: string | null
          connected_at?: string | null
          consecutive_errors?: number
          country_rule?: string
          created_at?: string
          custom_threshold?: number | null
          display_name?: string | null
          health_status?: string
          hmac_secret_encrypted?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean
          is_current?: boolean
          is_online?: boolean
          last_health_check?: string | null
          last_offline?: string | null
          last_online?: string | null
          last_ping_at?: string | null
          last_webhook_at?: string | null
          lovable_sync_api_key_encrypted?: string | null
          lovable_sync_default_currency?: string | null
          lovable_sync_default_locale?: string | null
          lovable_sync_enabled?: boolean
          lovable_sync_hmac_secret_encrypted?: string | null
          lovable_sync_last_error?: string | null
          lovable_sync_last_push?: string | null
          lovable_sync_status?: string | null
          lovable_sync_store_ref?: string | null
          lovable_sync_url?: string | null
          needs_reauth?: boolean
          oauth_scopes?: string | null
          offline_reason?: string | null
          product_push_url?: string | null
          proxy_enabled?: boolean
          proxy_host?: string | null
          proxy_port?: number | null
          proxy_type?: string
          recent_failures?: number
          registered_webhook_topics?: Json
          rotation_threshold?: number
          shadow_checkout_enabled?: boolean
          shop_domain: string
          sort_order?: number
          token_status?: string
          updated_at?: string
          webhook_secret_encrypted?: string | null
          webhooks_registered_at?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          avg_latency_ms?: number
          bridge_api_key_encrypted?: string | null
          bridge_last_connected?: string | null
          bridge_last_error?: string | null
          bridge_last_sync?: string | null
          bridge_site_url?: string | null
          bridge_status?: string | null
          cap_amount?: number | null
          cap_window_days?: number
          cap_window_revenue?: number
          cap_window_start?: string | null
          client_id?: string | null
          client_secret_encrypted?: string | null
          connected_at?: string | null
          consecutive_errors?: number
          country_rule?: string
          created_at?: string
          custom_threshold?: number | null
          display_name?: string | null
          health_status?: string
          hmac_secret_encrypted?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean
          is_current?: boolean
          is_online?: boolean
          last_health_check?: string | null
          last_offline?: string | null
          last_online?: string | null
          last_ping_at?: string | null
          last_webhook_at?: string | null
          lovable_sync_api_key_encrypted?: string | null
          lovable_sync_default_currency?: string | null
          lovable_sync_default_locale?: string | null
          lovable_sync_enabled?: boolean
          lovable_sync_hmac_secret_encrypted?: string | null
          lovable_sync_last_error?: string | null
          lovable_sync_last_push?: string | null
          lovable_sync_status?: string | null
          lovable_sync_store_ref?: string | null
          lovable_sync_url?: string | null
          needs_reauth?: boolean
          oauth_scopes?: string | null
          offline_reason?: string | null
          product_push_url?: string | null
          proxy_enabled?: boolean
          proxy_host?: string | null
          proxy_port?: number | null
          proxy_type?: string
          recent_failures?: number
          registered_webhook_topics?: Json
          rotation_threshold?: number
          shadow_checkout_enabled?: boolean
          shop_domain?: string
          sort_order?: number
          token_status?: string
          updated_at?: string
          webhook_secret_encrypted?: string | null
          webhooks_registered_at?: string | null
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          category: string
          created_at: string
          id: string
          level: string
          message: string
          metadata: Json
          store_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json
          store_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json
          store_id?: string | null
        }
        Relationships: []
      }
      translation_failures: {
        Row: {
          attempts: number
          created_at: string
          entity_id: string
          entity_type: string
          field: string
          id: string
          lang: string
          last_error: string | null
          source_hash: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_id: string
          entity_type: string
          field: string
          id?: string
          lang: string
          last_error?: string | null
          source_hash?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_id?: string
          entity_type?: string
          field?: string
          id?: string
          lang?: string
          last_error?: string | null
          source_hash?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      translations: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          field: string
          id: string
          lang: string
          source_hash: string | null
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          field: string
          id?: string
          lang: string
          source_hash?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          field?: string
          id?: string
          lang?: string
          source_hash?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      utm_campaigns: {
        Row: {
          campaign: string | null
          checkouts: number
          clicks: number
          content: string | null
          created_at: string
          generated_url: string | null
          id: string
          is_active: boolean
          medium: string | null
          name: string
          orders: number
          revenue: number
          source: string | null
          term: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          campaign?: string | null
          checkouts?: number
          clicks?: number
          content?: string | null
          created_at?: string
          generated_url?: string | null
          id?: string
          is_active?: boolean
          medium?: string | null
          name: string
          orders?: number
          revenue?: number
          source?: string | null
          term?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          campaign?: string | null
          checkouts?: number
          clicks?: number
          content?: string | null
          created_at?: string
          generated_url?: string | null
          id?: string
          is_active?: boolean
          medium?: string | null
          name?: string
          orders?: number
          revenue?: number
          source?: string | null
          term?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      variant_cache: {
        Row: {
          cache_key: string
          created_at: string
          id: string
          last_used: string | null
          product_id: string | null
          product_slug: string | null
          store_id: string | null
          updated_at: string
          value: Json
          variant_data: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          id?: string
          last_used?: string | null
          product_id?: string | null
          product_slug?: string | null
          store_id?: string | null
          updated_at?: string
          value?: Json
          variant_data?: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          id?: string
          last_used?: string | null
          product_id?: string | null
          product_slug?: string | null
          store_id?: string | null
          updated_at?: string
          value?: Json
          variant_data?: Json
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          error: string | null
          error_message: string | null
          event_type: string | null
          id: string
          payload: Json
          processed: boolean
          received_at: string
          signature_valid: boolean
          status: string | null
          store_id: string | null
          topic: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          error?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          received_at?: string
          signature_valid?: boolean
          status?: string | null
          store_id?: string | null
          topic?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          error?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          received_at?: string
          signature_valid?: boolean
          status?: string | null
          store_id?: string | null
          topic?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
