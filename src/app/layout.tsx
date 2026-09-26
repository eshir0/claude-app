import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PreferenceClassSync } from "@/components/PreferenceClassSync";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "사용량 대시보드",
  description: "AI 구독 사용량 및 서버 지표를 확인하는 개인 대시보드",
};

// Inline, pre-paint bootstrap — a synchronous inline script in <head>, so
// it runs before the body is parsed or painted (no flash of the wrong theme
// or of an expanded-then-collapsing sidebar). Theme: explicit user choice
// from localStorage first, OS preference otherwise. Sidebar: persisted
// collapse preference, default expanded. This alone is not enough on pages
// where hydration fails — see PreferenceClassSync for why and how that's
// covered. No next-themes dependency.
const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
  try {
    var collapsed = localStorage.getItem("sidebar-collapsed") === "true";
    document.documentElement.classList.toggle("sidebar-collapsed", collapsed);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <PreferenceClassSync />
        {children}
      </body>
    </html>
  );
}
