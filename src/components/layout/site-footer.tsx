"use client";
import { usePathname } from "next/navigation";
const PORTFOLIO_URL = "https://davidtsymbalov.github.io/Portfolio.david/";
export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <footer className="workspace-footer">
    <span>Management Laboratory</span>
    <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">Created by David Tsymbalov ↗</a>
  </footer>;
}
