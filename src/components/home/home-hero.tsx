"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Pause, Play } from "lucide-react";
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
    <section className="landing-stage" aria-labelledby="landing-title">
      <div className="landing-art">
        <video key={film} ref={videoRef} className="landing-video" src={publicUrl(films[film])} muted playsInline preload="metadata" poster={publicUrl(film === 0 ? "/media/hero-poster.jpg" : "/media/showreel-poster.jpg")} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setFilm((current) => (current + 1) % films.length)} aria-hidden />
      </div>
      <div className="landing-copy">
        <h1 id="landing-title">Дневник<br />класса</h1>
        <p className="landing-lead">Баллы и достижения<br />Management Laboratory.</p>
      </div>
      <div className="landing-film-controls">
        <div className="video-scenes" role="group" aria-label="Фоновое видео">{films.map((_, index) => <button key={index} type="button" className="video-scene" aria-label={`Видео ${index + 1}`} aria-pressed={film === index} onClick={() => setFilm(index)}><span aria-hidden />{index === 0 ? "Фильм 1" : "Фильм 2"}</button>)}</div>
        <button type="button" className="video-control" aria-label={playing ? "Остановить фоновое видео" : "Включить фоновое видео"} onClick={togglePlayback}>{playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}</button>
      </div>
      <nav className="entry-list" aria-label="Выберите кабинет">
        <Link href="/student/" className="entry-link entry-primary"><span className="entry-copy"><strong>Ученику</strong><small>Мои результаты</small></span><span className="entry-arrow"><ArrowRight aria-hidden size={22} /></span></Link>
        <Link href="/admin/" className="entry-link"><span className="entry-copy"><strong>Администратору</strong><small>Ученики и награды</small></span><span className="entry-arrow"><ArrowRight aria-hidden size={22} /></span></Link>
      </nav>
    </section>
    <div className="landing-bottom"><Link href="/teacher/" className="landing-teacher">Вход преподавателя</Link><a href="https://davidtsymbalov.github.io/Portfolio.david/" target="_blank" rel="noopener noreferrer">David Tsymbalov</a></div>
  </div>;
}
