import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  product_slug: string;
  product_name: string;
  variant_label?: string;
  price: number;
  quantity: number;
  image?: string;
  /** Shopify numeric variant id — required for Shadow API checkout */
  shopify_variant_id?: string | number;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  add: (item: CartItem) => void;
  remove: (slug: string, variant?: string) => void;
  setQty: (slug: string, variant: string | undefined, qty: number) => void;
  clear: () => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  count: () => number;
  total: () => number;
}

const sameLine = (a: CartItem, slug: string, variant?: string) =>
  a.product_slug === slug && (a.variant_label || "") === (variant || "");

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      add: (item) =>
        set((s) => {
          const existing = s.items.find((i) => sameLine(i, item.product_slug, item.variant_label));
          if (existing) {
            return {
              items: s.items.map((i) =>
                sameLine(i, item.product_slug, item.variant_label)
                  ? { ...i, quantity: Math.min(99, i.quantity + item.quantity) }
                  : i,
              ),
              isOpen: true,
            };
          }
          return { items: [...s.items, item], isOpen: true };
        }),
      remove: (slug, variant) =>
        set((s) => ({ items: s.items.filter((i) => !sameLine(i, slug, variant)) })),
      setQty: (slug, variant, qty) =>
        set((s) => ({
          items: s.items.map((i) =>
            sameLine(i, slug, variant) ? { ...i, quantity: Math.max(1, Math.min(99, qty)) } : i,
          ),
        })),
      clear: () => set({ items: [] }),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      count: () => get().items.reduce((n, i) => n + i.quantity, 0),
      total: () => get().items.reduce((n, i) => n + i.price * i.quantity, 0),
    }),
    { name: "happyscam-cart" },
  ),
);
