"use client";

import { SessionProvider } from "next-auth/react";
import { createContext, useContext, useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";

const AuthModalCtx = createContext<{ open: () => void; close: () => void }>({
  open: () => {},
  close: () => {},
});

export function useAuthModal() {
  return useContext(AuthModalCtx);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <SessionProvider>
      <AuthModalCtx.Provider
        value={{ open: () => setIsOpen(true), close: () => setIsOpen(false) }}
      >
        {children}
        {isOpen && <AuthModal onClose={() => setIsOpen(false)} />}
      </AuthModalCtx.Provider>
    </SessionProvider>
  );
}
