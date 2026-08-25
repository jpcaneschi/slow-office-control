"use client";

import type { ReactNode } from "react";

export default function FuncionariosLayout({ children }: { children: ReactNode }) {
  function onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const button = target.closest("button");
    if (!button) return;
    if (button.textContent?.trim() !== "Editar") return;
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 40);
  }

  return <div onClickCapture={onClickCapture}>{children}</div>;
}
