"use client";

import { SessionProvider } from "next-auth/react";
import { createContext, useContext, useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { PwaActions } from "@/components/pwa/PwaActions";
// 微信入口暂隐藏(iLink 24h 窗口保活无解,改以邮件+浏览器通知为主)。恢复:取消下面两处注释。
// import { WeixinActivateBanner } from "@/components/pwa/WeixinActivateBanner";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { ToastProvider } from "@/components/Toast";

const AuthModalCtx = createContext<{
  open: (reason?: string) => void;
  close: () => void;
}>({
  open: () => {},
  close: () => {},
});

export function useAuthModal() {
  return useContext(AuthModalCtx);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  // 登录弹窗的情境理由(如从"深读"触发时,说清"登录能得到什么"),没有则用默认副标题
  const [authReason, setAuthReason] = useState<string | undefined>(undefined);
  return (
    <SessionProvider>
      <ConfirmProvider>
        <ToastProvider>
          <AuthModalCtx.Provider
            value={{
              open: (reason?: string) => {
                setAuthReason(reason);
                setIsOpen(true);
              },
              close: () => setIsOpen(false),
            }}
          >
            <OfflineBanner />
            {/* <WeixinActivateBanner /> */}
            {children}
            {isOpen && (
              <AuthModal onClose={() => setIsOpen(false)} reason={authReason} />
            )}
            <PwaActions />
          </AuthModalCtx.Provider>
        </ToastProvider>
      </ConfirmProvider>
    </SessionProvider>
  );
}
