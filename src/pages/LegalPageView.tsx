import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { CartDrawer } from "@/components/storefront/CartDrawer";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useEntityTranslations, tField } from "@/hooks/useTranslations";

// Sostituisce {{xxx}} con valori azienda; placeholder mancanti vengono rimossi
// per mantenere il testo generico e leggibile.
function applyPlaceholders(text: string, company: any): string {
  return text.replace(/\s*\{\{(\w+)\}\}\s*/g, (_, k) => {
    const v = company?.[k];
    return v != null && String(v).trim() ? ` ${String(v)} ` : " ";
  }).replace(/[ \t]{2,}/g, " ");
}

export function LegalPageView({ slug }: { slug: string }) {
  const { lang } = useI18n();
  const [page, setPage] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: pageRow }, { data: companyRow }] = await Promise.all([
        supabase.from("legal_pages").select("*").eq("slug", slug).eq("is_published", true).maybeSingle(),
        supabase.from("company_info").select("*").maybeSingle(),
      ]);
      if (!pageRow) setNotFound(true);
      else setPage(pageRow);
      setCompany(companyRow);
      setLoading(false);
    })();
  }, [slug]);

  return (
    <div className="min-h-screen bg-background">
      <StoreHeader />
      <CartDrawer />
      <main className="mx-auto max-w-3xl px-6 py-12">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : notFound ? (
          <div className="text-center py-20">
            <h1 className="text-3xl font-bold">404</h1>
            <p className="text-muted-foreground mt-2">"{slug}"</p>
            <Link to="/{-$locale}" params={{} as any} className="text-primary hover:underline mt-4 inline-block">← Home</Link>
          </div>
        ) : (
          <LegalArticle slug={slug} page={page} company={company} lang={lang} />
        )}
      </main>
      <StoreFooter />
    </div>
  );
}

function LegalArticle({ slug, page, company, lang }: { slug: string; page: any; company: any; lang: string }) {
  const tx = useEntityTranslations("legal_page", [slug]);
  const body = tField(tx, slug, "body_markdown", page.body_markdown || "");
  return (
    <article className="space-y-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-sm [&_ul]:text-muted-foreground [&_li]:my-1 [&_a]:text-primary [&_a]:underline [&_strong]:text-foreground [&_strong]:font-semibold">
      <ReactMarkdown>{applyPlaceholders(body, company)}</ReactMarkdown>
      <p className="text-xs text-muted-foreground mt-12 pt-6 border-t">
        {new Date(page.updated_at).toLocaleDateString(lang === "en" ? "en-GB" : `${lang}-${lang.toUpperCase()}`)}
      </p>
    </article>
  );
}
