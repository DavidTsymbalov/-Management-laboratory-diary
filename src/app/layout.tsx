import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { MainShell } from "@/components/layout/main-shell";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PixelTransition } from "@/components/motion/pixel-transition";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { publicUrl } from "@/lib/public-url";
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
  referrer: "strict-origin-when-cross-origin",
  icons: {
    // Native media selection follows Safari/macOS, independently of the site toggle.
    icon: [
      ...(["light", "dark"] as const).flatMap((scheme) => [
        { url: publicUrl(`/brand/lbm-system-${scheme}-v4.ico`), sizes: "16x16 32x32 48x48 64x64", type: "image/x-icon", media: `(prefers-color-scheme: ${scheme})` },
        { url: publicUrl(`/brand/lbm-system-${scheme}-32-v4.png`), sizes: "32x32", type: "image/png", media: `(prefers-color-scheme: ${scheme})` },
        { url: publicUrl(`/brand/lbm-system-${scheme}-16-v4.png`), sizes: "16x16", type: "image/png", media: `(prefers-color-scheme: ${scheme})` },
      ]),
    ],
    apple: [{ url: publicUrl("/brand/lbm-dark-apple-v3.png"), sizes: "180x180", type: "image/png" }],
  },
  title: {
    default: "Management Laboratory",
    template: "%s · Management Laboratory",
  },
  description: "Дашборд баллов и ачивок класса. Командный проект №2.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080a0d",
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

const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('ml-theme');
    var theme = stored === 'dark' || stored === 'light'
      ? stored
      : 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: fontFaceCss }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <PixelTransition />
          <SiteHeader />
          <MainShell>{children}</MainShell>
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
