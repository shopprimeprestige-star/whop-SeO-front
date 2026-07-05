import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Inietta favicon, theme color e titolo dinamico (da CMS branding) al mount.
 * Sovrascrive il <title> di home e shop col nome store impostato in Branding.
 */
export function CMSHeadInjector() {
  const location = useLocation();
  const pathname = location.pathname;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("site_branding")
        .select("favicon_url, store_name, primary_color, og_title, og_description")
        .maybeSingle();
      if (!data) return;

      // Favicon
      if (data.favicon_url) {
        let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = data.favicon_url;
      }

      // Theme color
      if (data.primary_color) {
        let meta = document.querySelector("meta[name='theme-color']") as HTMLMetaElement | null;
        if (!meta) {
          meta = document.createElement("meta");
          meta.name = "theme-color";
          document.head.appendChild(meta);
        }
        meta.content = data.primary_color;
      }

      // Titolo dinamico per home e shop: usa store_name (o og_title)
      const cleanPath = pathname.replace(/^\/[a-z]{2}(\/|$)/, "/");
      const isHome = cleanPath === "/" || cleanPath === "";
      const isShop = cleanPath === "/shop" || cleanPath.startsWith("/shop");
      const brandTitle = data.og_title || data.store_name;
      if (brandTitle && (isHome || isShop)) {
        document.title = brandTitle;
        const setMeta = (sel: string, attr: string, key: string, val: string) => {
          let m = document.querySelector(sel) as HTMLMetaElement | null;
          if (!m) {
            m = document.createElement("meta");
            m.setAttribute(attr, key);
            document.head.appendChild(m);
          }
          m.content = val;
        };
        setMeta("meta[property='og:title']", "property", "og:title", brandTitle);
        if (data.og_description) {
          setMeta("meta[name='description']", "name", "description", data.og_description);
          setMeta("meta[property='og:description']", "property", "og:description", data.og_description);
        }
      }
    })();
  }, [pathname]);

  return null;
}
