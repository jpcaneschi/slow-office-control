import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {
  DASHBOARD_THEME_STORAGE_KEY,
  DASHBOARD_VALUES_STORAGE_KEY,
} from "@/lib/dashboard-preferences";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Nexo Gestão",
    template: "%s | Nexo Gestão",
  },
  description:
    "Gestão segura para lojas: vendas, estoque, clientes, financeiro, equipe e relatórios em um só lugar.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const dashboardPreferencesScript = `(() => {
  try {
    const root = document.documentElement;
    const theme = localStorage.getItem(${JSON.stringify(DASHBOARD_THEME_STORAGE_KEY)});
    const values = localStorage.getItem(${JSON.stringify(DASHBOARD_VALUES_STORAGE_KEY)});
    root.dataset.nexoTheme = theme === "dark" ? "dark" : "light";
    root.dataset.nexoValues = values === "hidden" ? "hidden" : "visible";
  } catch (_) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-nexo-theme="light"
      data-nexo-values="visible"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          id="nexo-dashboard-preferences"
          dangerouslySetInnerHTML={{ __html: dashboardPreferencesScript }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
