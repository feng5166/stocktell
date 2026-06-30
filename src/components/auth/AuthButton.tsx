"use client";

import { useAuthModal } from "@/components/Providers";

export function AuthButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { open } = useAuthModal();
  return (
    <button className={className} onClick={() => open()}>
      {children}
    </button>
  );
}
