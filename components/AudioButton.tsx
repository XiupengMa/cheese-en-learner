"use client";

import { useRef, useState } from "react";

interface AudioButtonProps {
  /** Recorded pronunciation audio URL, if available. */
  src?: string | null;
  /** Text to speak via browser TTS when no recording is available. */
  text: string;
  title?: string;
  className?: string;
}

export function AudioButton({ src, text, title, className }: AudioButtonProps) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function speak() {
    if (!("speechSynthesis" in window)) {
      setPlaying(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang === "en-US" || v.lang.startsWith("en_US"));
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(utterance);
  }

  function play() {
    if (playing) {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    if (src) {
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.onerror = () => speak();
      audio.play().catch(() => speak());
    } else {
      speak();
    }
  }

  return (
    <button
      type="button"
      onClick={play}
      title={title ?? "Play pronunciation"}
      aria-label={title ?? `Play pronunciation of ${text}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full p-1.5 transition-colors ${
        playing
          ? "text-amber-500 animate-pulse"
          : "text-neutral-400 hover:text-amber-500"
      } ${className ?? ""}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
        <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
      </svg>
    </button>
  );
}
