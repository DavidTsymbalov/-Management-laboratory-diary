"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { publicUrl } from "@/lib/public-url";

export function HomeHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      if (media.matches) video.pause();
      else void video.play().catch(() => undefined);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return <div className="landing">
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-copy">
        <p className="eyebrow"><span className="edition-square" aria-hidden /> Дневник Management Laboratory</p>
        <h1 id="landing-title">За каждым<br />результатом&nbsp;—<br /><span>твоя работа.</span></h1>
        <p className="landing-lead">Баллы, достижения и жизнь класса.<br />Всё, что получилось, — в одном дневнике.</p>
        <p className="landing-caption"><span aria-hidden>↳</span> Начни со своего кабинета</p>
        <nav className="entry-list" aria-label="Выберите кабинет">
          <Link href="/student/" className="entry-link entry-primary"><span className="entry-number">01</span><span className="entry-copy"><strong>Я ученик</strong><small>Посмотреть свои результаты</small></span><ArrowUpRight aria-hidden size={25} /></Link>
          <Link href="/admin/" className="entry-link"><span className="entry-number">02</span><span className="entry-copy"><strong>Я администратор</strong><small>Управлять классом и наградами</small></span><ArrowUpRight aria-hidden size={25} /></Link>
        </nav>
        <Link href="/teacher/" className="landing-teacher">Вход для преподавателя <ArrowUpRight size={14} aria-hidden /></Link>
      </div>
      <figure className="landing-art">
        <video ref={videoRef} className="landing-video" muted loop playsInline preload="metadata" poster={publicUrl("/media/hero-poster.jpg")} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} aria-hidden>
          <source src={publicUrl("/media/hero.mp4")} type="video/mp4" />
        </video>
        <div className="landing-art-top" aria-hidden><span>ML / DIARY</span><span>Личный результат.<br />Общее движение.</span></div>
        <div className="landing-art-word" aria-hidden>Keep<br /><span>growing.</span></div>
        <figcaption className="landing-art-caption"><span>Management Laboratory<br /><small>Пространство для роста</small></span><button type="button" className="video-control" aria-label={playing ? "Остановить фоновое видео" : "Включить фоновое видео"} onClick={() => { const video = videoRef.current; if (video) { if (video.paused) void video.play().catch(() => undefined); else video.pause(); } }}>{playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}</button></figcaption>
      </figure>
    </section>
    <div className="landing-bottom"><span>Учебный дневник класса</span><span>Создано для тех, кто учится и учит.</span></div>
  </div>;
}
