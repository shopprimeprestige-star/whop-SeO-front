import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SiteBranding = {
  store_name: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  header_tagline: string | null;
  top_banner_enabled: boolean;
  top_banner_text: string | null;
  top_banner_link: string | null;
  top_banner_bg: string | null;
  top_banner_fg: string | null;
  horizon_enabled: boolean;
  horizon_text: string | null;
  horizon_logos: { name: string; url: string }[];
  primary_color: string | null;
  accent_color: string | null;
};

export type FooterConfig = {
  id: string;
  copyright_text: string | null;
  footer_description: string | null;
  newsletter_enabled: boolean;
  newsletter_title: string | null;
  newsletter_subtitle: string | null;
  links: { label: string; url: string }[];
  badges: { name: string; url: string }[];
  payment_methods: { name: string; url: string }[];
  courier_logo_height_mobile?: number | null;
  courier_logo_height_desktop?: number | null;
};

export type CompanyInfo = {
  company_name: string;
  legal_name: string | null;
  vat_number: string | null;
  tax_code: string | null;
  rea_number: string | null;
  contact_email: string | null;
  support_email: string | null;
  contact_phone: string | null;
  whatsapp: string | null;
  address_line1: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  country: string | null;
  business_hours: string | null;
  free_shipping_threshold: number | null;
  return_window_days: number;
  social_links: Record<string, string> | null;
};

let cache: { branding?: SiteBranding; footer?: FooterConfig; company?: CompanyInfo } = {};

export function useSiteBranding() {
  const [data, setData] = useState<SiteBranding | null>(cache.branding ?? null);
  useEffect(() => {
    if (cache.branding) return;
    supabase.from("site_branding").select("*").maybeSingle().then(({ data }) => {
      if (data) {
        const b = { ...data, horizon_logos: (data.horizon_logos as any) || [] } as SiteBranding;
        cache.branding = b;
        setData(b);
      }
    });
  }, []);
  return data;
}

export function useFooterConfig() {
  const [data, setData] = useState<FooterConfig | null>(cache.footer ?? null);
  useEffect(() => {
    if (cache.footer) return;
    supabase.from("footer_config").select("*").maybeSingle().then(({ data }) => {
      if (data) {
        const f = {
          ...data,
          links: (data.links as any) || [],
          badges: (data.badges as any) || [],
          payment_methods: (data.payment_methods as any) || [],
        } as FooterConfig;
        cache.footer = f;
        setData(f);
      }
    });
  }, []);
  return data;
}

export function useCompanyInfo() {
  const [data, setData] = useState<CompanyInfo | null>(cache.company ?? null);
  useEffect(() => {
    if (cache.company) return;
    supabase.from("company_info").select("*").maybeSingle().then(({ data }) => {
      if (data) {
        cache.company = data as CompanyInfo;
        setData(data as CompanyInfo);
      }
    });
  }, []);
  return data;
}
