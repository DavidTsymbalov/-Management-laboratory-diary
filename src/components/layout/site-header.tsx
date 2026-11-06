"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { publicUrl } from "@/lib/public-url";

export function SiteHeader() {
  const pathname = usePathname();
  const onHome = pathname === "/";

  return <>
    <a className="skip-link" href="#main-content">К содержанию</a>
    <header className={`workspace-header${onHome ? " landing-header" : ""}`}>
      <Link href="/" className="workspace-brand" aria-label="Management Laboratory — главная">
        <Image src={publicUrl("/brand/hawk-owl-icon.png")} width={29} height={39} alt="" className="brand-owl" priority />
        <span translate="no">Management<span className="brand-subtitle">Laboratory</span></span>
      </Link>
      {onHome ? <span className="workspace-context">Учебный дневник</span> : <Link href="/" className="workspace-home"><ArrowLeft size={15} aria-hidden />На главную</Link>}
    </header>
  </>;
}
