"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { ScrambleText } from "@/components/motion/scramble-text";
import { publicUrl } from "@/lib/public-url";

const films = ["/media/hero.mp4", "/media/showreel.mp4"];

export function HomeHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackChoice = useRef<"auto" | "play" | "pause">("auto");
  const [film, setFilm] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      if (document.hidden || playbackChoice.current === "pause" || (media.matches && playbackChoice.current !== "play")) video.pause();
      else void video.play().catch(() => undefined);
    };
    const onMotionPreference = () => {
      if (media.matches && playbackChoice.current === "play") playbackChoice.current = "auto";
      sync();
    };
    sync();
    media.addEventListener("change", onMotionPreference);
    document.addEventListener("visibilitychange", sync);
    return () => {
      media.removeEventListener("change", onMotionPreference);
      document.removeEventListener("visibilitychange", sync);
      video.pause();
    };
  }, [film]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      playbackChoice.current = "play";
      void video.play().catch(() => undefined);
    } else {
      playbackChoice.current = "pause";
      video.pause();
    }
  };

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
        <video key={film} ref={videoRef} className="landing-video" src={publicUrl(films[film])} muted playsInline preload="metadata" poster={publicUrl(film === 0 ? "/media/hero-poster.jpg" : "/media/showreel-poster.jpg")} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setFilm((current) => (current + 1) % films.length)} aria-hidden />
        <div className="landing-art-top" aria-hidden><span><ScrambleText text="ML / DIARY" playOnMount mountDelayMs={220} /></span><span>Личный результат.<br />Общее движение.</span></div>
        <div className="landing-art-word" aria-hidden>Keep<br /><span>growing.</span></div>
        <figcaption className="landing-art-caption"><span>Management Laboratory<br /><small>Пространство для роста</small></span><div className="video-controls"><div className="video-scenes" role="group" aria-label="Фоновое видео">{films.map((_, index) => <button key={index} type="button" className="video-scene" aria-label={`Видео ${index + 1}`} aria-pressed={film === index} onClick={() => setFilm(index)}>0{index + 1}</button>)}</div><button type="button" className="video-control" aria-label={playing ? "Остановить фоновое видео" : "Включить фоновое видео"} onClick={togglePlayback}>{playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}</button></div></figcaption>
      </figure>
    </section>
    <div className="landing-bottom"><span>Учебный дневник класса</span><span>Создано для тех, кто учится и учит.</span></div>
  </div>;
}
