import { useI18n, SUPPORTED_LANGS, Lang } from "@/lib/i18n";
import { Globe } from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { withLocale, stripLocale } from "@/lib/locale-utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, country } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const current = SUPPORTED_LANGS.find((s) => s.code === lang) || SUPPORTED_LANGS[0];

  const handleChange = (newLang: Lang) => {
    setLang(newLang);
    const cleanPath = stripLocale(location.pathname);
    const target = withLocale(cleanPath, newLang === "it" ? null : newLang);
    navigate({ to: target, replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        aria-label="Lang"
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="text-base leading-none">{current.flag}</span>
        {!compact && <span className="uppercase">{current.code}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {SUPPORTED_LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={(e) => { e.preventDefault(); handleChange(l.code as Lang); }}
            className={`gap-2 cursor-pointer ${l.code === lang ? "bg-muted" : ""}`}
          >
            <span className="text-base">{l.flag}</span>
            <span className="flex-1">{l.label}</span>
            <span className="text-[10px] uppercase text-muted-foreground">{l.code}</span>
          </DropdownMenuItem>
        ))}
        {country && (
          <div className="border-t mt-1 pt-1.5 px-2 pb-1 text-[10px] text-muted-foreground">
            IP: {country}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
