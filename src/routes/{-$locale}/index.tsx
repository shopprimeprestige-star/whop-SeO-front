import { createFileRoute, redirect } from "@tanstack/react-router";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { CartDrawer } from "@/components/storefront/CartDrawer";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { HomeSections } from "@/components/storefront/HomeSections";
import { useLPTracking } from "@/hooks/useLPTracking";
import { useBotCheck } from "@/hooks/useBotCheck";
import { SUPPORTED_LANG_CODES, isSupportedLang, hreflangLinks, localizedTitle } from "@/lib/locale-utils";

export const Route = createFileRoute("/{-$locale}/")({
  beforeLoad: ({ params }) => {
    if (params.locale && !isSupportedLang(params.locale)) {
      throw redirect({ to: "/{-$locale}", params: {} as any });
    }
  },
  head: ({ params }) => {
    const lang = params.locale || "it";
    return {
      meta: [
        { title: localizedTitle("home", lang) },
        { name: "description", content: localizedTitle("home_desc", lang) },
        { property: "og:title", content: localizedTitle("home", lang) },
        { property: "og:description", content: localizedTitle("home_desc", lang) },
        { property: "og:locale", content: lang },
      ],
      links: hreflangLinks("/"),
    };
  },
  component: Index,
});

function Index() {
  const isBot = useBotCheck();
  useLPTracking({ enabled: isBot === false });
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/10 to-background">
      <StoreHeader />
      <CartDrawer />
      <main className="mx-auto max-w-7xl px-6">
        <HomeSections />
      </main>
      <StoreFooter />
    </div>
  );
}

export { SUPPORTED_LANG_CODES };
