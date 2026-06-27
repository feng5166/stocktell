"use client";

import { SessionProvider } from "next-auth/react";
import { createContext, useContext, useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { PwaActions } from "@/components/pwa/PwaActions";

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
        <OfflineBanner />
        {children}
        {isOpen && <AuthModal onClose={() => setIsOpen(false)} />}
        <PwaActions />
      </AuthModalCtx.Provider>
    </SessionProvider>
  );
}
