"use client";

// 全站通用确认弹窗(替代浏览器原生 confirm)。promise 化:
//   const confirm = useConfirm();
//   if (!(await confirm({ title, message, confirmText, danger: true }))) return;
// 视觉与登录弹窗一致(遮罩 + 圆角白卡);danger=true 时确定键用红色(危险操作)。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(async () => false);
export function useConfirm() {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  useLockBodyScroll(!!opts);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  }, []);

  // Esc = 取消;确定键不再 autoFocus,回车不会误触不可逆操作
  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts, close]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts && (
        <div
          onClick={() => close(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-base font-semibold text-gray-900">
              {opts.title}
            </h2>
            {opts.message && (
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                {opts.message}
              </p>
            )}
            {/* 手机:上下堆叠全宽,取消落在拇指最近处(底部)、危险键拉开;桌面恢复右对齐横排。
                去掉危险键 autoFocus——避免回车直接执行不可逆操作。 */}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => close(false)}
                className="min-h-[44px] w-full rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 sm:w-auto"
              >
                {opts.cancelText ?? "取消"}
              </button>
              <button
                onClick={() => close(true)}
                className={`min-h-[44px] w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white sm:w-auto ${
                  opts.danger
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-gray-900 hover:bg-gray-700"
                }`}
              >
                {opts.confirmText ?? "确定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
