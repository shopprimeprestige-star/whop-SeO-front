import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Store,
  Package,
  Tag,
  TrendingUp,
  Settings,
  LogOut,
  ScrollText,
  Palette,
  FileText,
  LayoutTemplate,
  Activity,
  Languages,
  Send,
} from "lucide-react";
import { signOut } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const groups = [
  {
    label: "Operazioni",
    items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
      { title: "Stores & Rotazione", url: "/admin/stores", icon: Store },
      { title: "Verifica Bridge", url: "/admin/bridge-check", icon: Activity },
    ],
  },
  {
    label: "Catalogo",
    items: [
      { title: "Prodotti", url: "/admin/products", icon: Package },
      { title: "Statistiche prodotti", url: "/admin/product-stats", icon: TrendingUp },
      { title: "Categorie", url: "/admin/categories", icon: Tag },
      { title: "Sync → Sito B", url: "/admin/sync", icon: Send },
    ],
  },
  {
    label: "Sito",
    items: [
      { title: "Branding", url: "/admin/branding", icon: Palette },
      { title: "Home & Footer", url: "/admin/content", icon: LayoutTemplate },
      { title: "Traduzioni i18n", url: "/admin/i18n", icon: Languages },
      { title: "Legale & Azienda", url: "/admin/legal", icon: FileText },
    ],
  },
  {
    label: "Sistema",
    items: [{ title: "Impostazioni", url: "/admin/settings", icon: Settings }],
  },
];

export function AdminSidebar() {
  const location = useLocation();

  const isActive = (url: string) =>
    url === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60">
      <SidebarHeader className="border-b border-sidebar-border/60 px-3 py-3.5">
        <Link to="/admin" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-[12px] font-semibold tracking-tight">
            H
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-[13px] font-medium leading-none tracking-tight">HappyScam</span>
            <span className="text-[10.5px] text-muted-foreground mt-1 tracking-wide">CRM Admin</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1.5 py-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70 px-2 mb-0.5">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="h-8 text-[13px] font-normal data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" strokeWidth={1.6} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 p-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
          className="w-full h-8 justify-start gap-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.6} />
          <span className="group-data-[collapsible=icon]:hidden">Esci</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
