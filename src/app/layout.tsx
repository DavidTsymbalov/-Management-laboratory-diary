import type { Metadata } from "next";
import { Manrope, Unbounded } from "next/font/google";
import { MainShell } from "@/components/layout/main-shell";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PixelTransition } from "@/components/motion/pixel-transition";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: {
    default: "Management Laboratory",
    template: "%s · Management Laboratory",
  },
  description: "Дашборд баллов и ачивок класса. Командный проект №2.",
};

const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('ml-theme');
    var theme = stored === 'dark' || stored === 'light'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
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
      className={`${manrope.variable} ${unbounded.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
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
