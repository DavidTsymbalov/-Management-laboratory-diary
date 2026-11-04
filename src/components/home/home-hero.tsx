"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Container } from "@/components/layout/container";
import { publicUrl } from "@/lib/public-url";
import { isStudentLoggedIn, isTeacherLoggedIn } from "@/lib/session";

export function HomeHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [teacherHref, setTeacherHref] = useState("/teacher/");
  const [studentHref, setStudentHref] = useState("/student/");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const play = () => {
      video.play().catch(() => undefined);
    };
    play();
    video.addEventListener("loadeddata", play);
    return () => video.removeEventListener("loadeddata", play);
  }, []);

  useEffect(() => {
    const sync = () => {
      setTeacherHref(isTeacherLoggedIn() ? "/teacher/dashboard/" : "/teacher/");
      setStudentHref(isStudentLoggedIn() ? "/student/dashboard/" : "/student/");
    };
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  return (
    <section className="uc-hero">
      <div className="uc-hero-media" aria-hidden>
        <video
          ref={videoRef}
          className="uc-hero-video"
          autoPlay
          muted
          loop
          playsInline
          poster={publicUrl("/media/hero-poster.jpg")}
        >
          <source src={publicUrl("/media/hero.mp4")} type="video/mp4" />
        </video>
        <div className="uc-hero-veil" />
        <div className="uc-hero-grain" />
      </div>

      <h1 className="uc-slogan">
        <span className="uc-slogan-line">Management</span>
        <span className="uc-slogan-line uc-slogan-line-2">laboratory</span>
        <span className="uc-slogan-line uc-slogan-line-3">diary</span>
      </h1>

      <Container className="uc-hero-bottom relative z-10 flex min-h-[100svh] flex-col justify-end pb-10 pt-32 sm:pt-24">
        <div className="flex flex-col items-center gap-5 sm:items-end">
          <p className="max-w-sm text-center text-sm leading-relaxed tracking-wide text-[#e5dac3] sm:text-right">
            • Кабинет класса: баллы, ачивки, рейтинг.
          </p>
          <div className="grid w-full max-w-sm grid-cols-2 gap-3 sm:flex sm:w-auto sm:max-w-none sm:flex-wrap sm:justify-end sm:gap-2">
            <Link href={teacherHref} className="uc-chip">
              Учитель
            </Link>
            <Link href={studentHref} className="uc-chip uc-chip-ghost">
              Ученик
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
