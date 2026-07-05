import { Link, useLocation } from "@tanstack/react-router";
import { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { localeFromPath } from "@/lib/locale-utils";

/**
 * Link che usa la rotta {-$locale} mantenendo il prefisso locale corrente.
 * Passa `to` SENZA prefisso locale (es. "/", "/shop", "/p/$slug", "/legal/$slug").
 */
export function LocaleLink({
  to, params, className, children, ...rest
}: {
  to: "/" | "/shop" | "/p/$slug" | "/legal/$slug";
  params?: Record<string, string>;
  className?: string;
  children: ReactNode;
  [k: string]: any;
}) {
  const { lang } = useI18n();
  const location = useLocation();
  // Prefer URL locale (canonical), fallback to i18n state
  const urlLocale = localeFromPath(location.pathname);
  const effective = urlLocale || (lang === "it" ? undefined : lang);

  if (to === "/") {
    return (
      <Link to="/{-$locale}" params={{ locale: effective } as any} className={className} {...rest}>
        {children}
      </Link>
    );
  }
  if (to === "/shop") {
    return (
      <Link to="/{-$locale}/shop" params={{ locale: effective }} className={className} {...rest}>
        {children}
      </Link>
    );
  }
  if (to === "/p/$slug") {
    return (
      <Link to="/{-$locale}/p/$slug" params={{ locale: effective, slug: params!.slug }} className={className} {...rest}>
        {children}
      </Link>
    );
  }
  // legal
  return (
    <Link to="/{-$locale}/legal/$slug" params={{ locale: effective, slug: params!.slug }} className={className} {...rest}>
      {children}
    </Link>
  );
}
