import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { MainShell } from "@/components/layout/main-shell";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PixelTransition } from "@/components/motion/pixel-transition";
import "./globals.css";

/**
 * Шрифты uncommon.nl (Adobe Fonts / Typekit):
 * - aktiv-grotesk (n4)
 * - aktiv-grotesk-extended (n5)
 * Inter — только fallback для кириллицы, если в kit нет глифов.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Management Laboratory",
    template: "%s · Management Laboratory",
  },
  description: "Учебный дневник Management Laboratory: баллы, достижения и результаты класса.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#091422",
};

const fontBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const fontFaceCss = `
@font-face {
  font-family: "aktiv-grotesk";
  src: url("${fontBase}/fonts/aktiv-grotesk-400.woff2?v=3") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "aktiv-grotesk-extended";
  src: url("${fontBase}/fonts/aktiv-grotesk-extended-500.woff2?v=3") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} dark h-full antialiased`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: fontFaceCss }} />
      </head>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground antialiased">
        <PixelTransition />
        <SiteHeader />
        <MainShell>{children}</MainShell>
        <SiteFooter />
      </body>
    </html>
  );
}
