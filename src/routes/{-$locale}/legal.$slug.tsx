import { createFileRoute, redirect } from "@tanstack/react-router";
import { LegalPageView } from "@/pages/LegalPageView";
import { isSupportedLang } from "@/lib/locale-utils";

export const Route = createFileRoute("/{-$locale}/legal/$slug")({
  beforeLoad: ({ params }) => {
    if (params.locale && !isSupportedLang(params.locale)) throw redirect({ to: "/{-$locale}", params: {} as any });
  },
  component: LegalRoute,
});

function LegalRoute() {
  const { slug } = Route.useParams();
  return <LegalPageView slug={slug} />;
}
