import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { CMSHeadInjector } from "@/components/CMSHeadInjector";
import { I18nProvider } from "@/lib/i18n";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/{-$locale}"
            params={{} as any}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "NexaWord" },
      { name: "description", content: "Essential tech." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "NexaWord" },
      { property: "og:description", content: "Essential tech." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "NexaWord" },
      { name: "twitter:description", content: "Essential tech." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/h0b5EavjoHZ8d16W7KjaMoC4Ob33/social-images/social-1777474680918-Screenshot_2026-04-29_alle_16.57.49.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/h0b5EavjoHZ8d16W7KjaMoC4Ob33/social-images/social-1777474680918-Screenshot_2026-04-29_alle_16.57.49.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Performance: anticipate connections to critical 3rd-parties
      { rel: "preconnect", href: "https://bujhqhdhqsaadbklckfv.supabase.co", crossOrigin: "anonymous" } as any,
      { rel: "dns-prefetch", href: "https://bujhqhdhqsaadbklckfv.supabase.co" },
      { rel: "preconnect", href: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev", crossOrigin: "anonymous" } as any,
      { rel: "dns-prefetch", href: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev" },
      // ipapi è ora deferito a idle: solo dns-prefetch (più leggero del preconnect)
      { rel: "dns-prefetch", href: "https://ipapi.co" },
      { rel: "dns-prefetch", href: "https://open.er-api.com" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <I18nProvider>
      <CMSHeadInjector />
      <Outlet />
    </I18nProvider>
  );
}
