import { createFileRoute, redirect } from "@tanstack/react-router";
import { ShopPage } from "@/pages/ShopPage";
import { isSupportedLang, hreflangLinks, localizedTitle } from "@/lib/locale-utils";

export const Route = createFileRoute("/{-$locale}/shop")({
  beforeLoad: ({ params }) => {
    if (params.locale && !isSupportedLang(params.locale)) throw redirect({ to: "/{-$locale}", params: {} as any });
  },
  head: ({ params }) => {
    const lang = params.locale || "it";
    return {
      meta: [
        { title: localizedTitle("shop", lang) },
        { name: "description", content: localizedTitle("shop_desc", lang) },
        { property: "og:title", content: localizedTitle("shop", lang) },
        { property: "og:description", content: localizedTitle("shop_desc", lang) },
        { property: "og:locale", content: lang },
      ],
      links: hreflangLinks("/shop"),
    };
  },
  component: ShopPage,
});
