"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ProductPanel } from "./product-panel";

interface CartEntry {
  productId: string;
  quantity: number;
}

interface AppState {
  cart: CartEntry[];
  cartCount: number;
  setQuantity: (productId: string, quantity: number) => void;
  addToCart: (productId: string) => void;
  selectedBranches: number[];
  setSelectedBranches: (ids: number[]) => void;
  branchParam: string;
  openProduct: (id: string) => void;
  closeProduct: () => void;
  openProductId: string | null;
}

const Context = createContext<AppState | null>(null);
const BRANCH_KEY = "supersave.branches";

export function useApp(): AppState {
  const value = useContext(Context);
  if (!value) throw new Error("useApp outside provider");
  return value;
}

export function Providers({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [selectedBranches, setBranches] = useState<number[]>([]);
  const [openProductId, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cart")
      .then((r) => r.json())
      .then((d) => setCart(d.items ?? []))
      .catch(() => undefined);
    try {
      const saved = JSON.parse(localStorage.getItem(BRANCH_KEY) ?? "[]");
      if (Array.isArray(saved)) setBranches(saved.filter((n) => Number.isInteger(n)));
    } catch {
      // Private mode or blocked storage: every branch stays selected.
    }
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setCart((current) => {
      const others = current.filter((c) => c.productId !== productId);
      return quantity > 0 ? [...others, { productId, quantity }] : others;
    });
    fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, quantity }) }).catch(
      () => undefined,
    );
  }, []);

  const addToCart = useCallback(
    (productId: string) => {
      const existing = cart.find((c) => c.productId === productId);
      setQuantity(productId, (existing?.quantity ?? 0) + 1);
    },
    [cart, setQuantity],
  );

  const setSelectedBranches = useCallback((ids: number[]) => {
    setBranches(ids);
    try {
      localStorage.setItem(BRANCH_KEY, JSON.stringify(ids));
    } catch {
      // Selection then lasts for this visit only.
    }
  }, []);

  const value = useMemo<AppState>(
    () => ({
      cart,
      cartCount: cart.reduce((sum, c) => sum + c.quantity, 0),
      setQuantity,
      addToCart,
      selectedBranches,
      setSelectedBranches,
      branchParam: selectedBranches.join(","),
      openProduct: setOpen,
      closeProduct: () => setOpen(null),
      openProductId,
    }),
    [cart, setQuantity, addToCart, selectedBranches, setSelectedBranches, openProductId],
  );

  return (
    <Context.Provider value={value}>
      {children}
      <ProductPanel />
    </Context.Provider>
  );
}
