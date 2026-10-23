"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ScrambleText } from "@/components/motion/scramble-text";

const PORTFOLIO_URL = "https://davidtsymbalov.github.io/Portfolio.david/";
const PORTFOLIO_LABEL = PORTFOLIO_URL.replace(/^https?:\/\//, "");

/**
 * Нижний блок: видео + градиент 0→100 и кредиты автора.
 */
export function SiteFooter() {
  const pathname = usePathname();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const play = () => {
      video.play().catch(() => undefined);
    };
    play();
    video.addEventListener("loadeddata", play);
    return () => video.removeEventListener("loadeddata", play);
  }, [pathname]);

  if (pathname === "/") return null;

  return (
    <footer className="uc-footer-video mt-0 shrink-0">
      <div className="uc-footer-video-stage">
        <video
          ref={videoRef}
          className="uc-footer-video-el"
          autoPlay
          muted
          loop
          playsInline
          poster="/media/showreel-poster.jpg"
          aria-hidden
        >
          <source src="/media/showreel.mp4" type="video/mp4" />
        </video>
        <div className="uc-footer-video-fade" aria-hidden />

        <div className="uc-footer-credits">
          <p className="uc-footer-credits-left">Created by David Tsymbalov</p>
          <div className="uc-footer-credits-right">
            <p>more info on David&apos;s portfolio</p>
            <a
              href={PORTFOLIO_URL}
              className="btn-text uc-footer-credits-link"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={PORTFOLIO_LABEL}
            >
              <ScrambleText text={PORTFOLIO_LABEL} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
