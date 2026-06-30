"use client";

import { SessionProvider } from "next-auth/react";
import { createContext, useContext, useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { PwaActions } from "@/components/pwa/PwaActions";
// 微信入口暂隐藏(iLink 24h 窗口保活无解,改以邮件+浏览器通知为主)。恢复:取消下面两处注释。
// import { WeixinActivateBanner } from "@/components/pwa/WeixinActivateBanner";
import { ConfirmProvider } from "@/components/ConfirmDialog";

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
      <ConfirmProvider>
        <AuthModalCtx.Provider
          value={{ open: () => setIsOpen(true), close: () => setIsOpen(false) }}
        >
          <OfflineBanner />
          {/* <WeixinActivateBanner /> */}
          {children}
          {isOpen && <AuthModal onClose={() => setIsOpen(false)} />}
          <PwaActions />
        </AuthModalCtx.Provider>
      </ConfirmProvider>
    </SessionProvider>
  );
}
