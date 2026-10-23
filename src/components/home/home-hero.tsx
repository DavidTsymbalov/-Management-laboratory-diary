"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Container } from "@/components/layout/container";
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
          poster="/media/hero-poster.jpg"
        >
          <source src="/media/hero.mp4" type="video/mp4" />
        </video>
        <div className="uc-hero-veil" />
        <div className="uc-hero-grain" />
      </div>

      <Container className="relative z-10 flex min-h-[100svh] flex-col justify-between pb-10 pt-24">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="uc-slogan">
            <span>Management laboratory</span>
            <span>diary</span>
          </h1>
        </div>

        <div className="flex flex-col items-center gap-5 sm:items-end">
          <p className="max-w-sm text-center text-[0.72rem] leading-relaxed tracking-wide text-[#e5dac3] sm:text-right">
            • Кабинет класса: баллы, ачивки, рейтинг.
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
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
