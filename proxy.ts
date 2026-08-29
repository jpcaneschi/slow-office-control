import { NextResponse } from "next/server";

// Content Security Policy compatível com as páginas ESTÁTICAS do Next.
// (A versão com nonce exigiria renderização dinâmica em todas as páginas e
// quebrava os scripts do próprio Next em produção -> tela branca.)
// 'unsafe-inline'/'self' liberam os scripts do Next; ainda assim bloqueamos
// scripts de outros domínios, conexões fora do Supabase, iframes e afins.
export function proxy() {
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co`,
    `worker-src 'self' blob:`,
    `frame-ancestors 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join("; ");

  const response = NextResponse.next();
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
