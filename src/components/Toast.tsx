"use client";

// 轻量全局 toast:操作即时反馈(成功/失败)。通过 useToast() 在任意客户端组件里调用。
// 放在 Providers 里,渲染到 body(portal),固定在底部(避开移动端底栏)。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type ToastItem = { id: number; text: string; error?: boolean };
type ShowToast = (text: string, opts?: { error?: boolean }) => void;

const ToastCtx = createContext<ShowToast>(() => {});
export function useToast(): ShowToast {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback<ShowToast>((text, opts) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, text, error: opts?.error }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      3200
    );
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <Toaster toasts={toasts} />
    </ToastCtx.Provider>
  );
}

function Toaster({ toasts }: { toasts: ToastItem[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || toasts.length === 0) return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[120] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-[90vw] rounded-lg px-3.5 py-2 text-sm leading-snug text-white shadow-lg ${
            t.error ? "bg-gray-900" : "bg-emerald-600"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>,
    document.body
  );
}
