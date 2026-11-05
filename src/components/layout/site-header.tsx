"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { publicUrl } from "@/lib/public-url";

export function SiteHeader() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const dashboard = pathname.includes("/dashboard");
  const context = pathname.startsWith("/teacher") ? "Преподаватель" : pathname.startsWith("/admin") ? "Администратор" : "Ученик";

  return <>
    <a className="skip-link" href="#main-content">К содержанию</a>
    <header className={`workspace-header${onHome ? " landing-header" : ""}`}>
      <Link href="/" className="workspace-brand" aria-label="Management Laboratory — главная">
        <Image src={publicUrl("/brand/hawk-owl-icon.png")} width={29} height={39} alt="" className="brand-owl" priority />
        <span>Management<span className="brand-subtitle">Laboratory</span></span>
      </Link>
      <span className="workspace-context">Дневник класса <span aria-hidden>/</span> {onHome ? "Главная" : dashboard ? context : "Вход"}</span>
      {onHome ? <nav className="header-links" aria-label="Вход в кабинет">
        <Link href="/student/">Ученик</Link>
        <Link href="/admin/">Администратор <ArrowUpRight size={14} aria-hidden /></Link>
      </nav> : <Link href="/" className="workspace-home">На главную <ArrowUpRight size={15} aria-hidden /></Link>}
    </header>
  </>;
}
