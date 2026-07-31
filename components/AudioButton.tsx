"use client";

import { useEffect, useRef, useState } from "react";

interface AudioButtonProps {
  /** Recorded pronunciation audio URL, if available. */
  src?: string | null;
  /** Text to speak via browser TTS when no recording is available. */
  text: string;
  title?: string;
  className?: string;
}

// Chrome loads the voice list asynchronously: getVoices() returns [] until
// `voiceschanged` fires. Cache the best English voice at module level so the
// first click already has it. Prefer local voices — Chrome's remote (network)
// voices can fail silently, which reads as a dead button.
let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((v) => v.lang.replace("_", "-").startsWith("en"));
  const us = english.filter((v) => v.lang.replace("_", "-").startsWith("en-US"));
  return (
    us.find((v) => v.localService) ??
    us[0] ??
    english.find((v) => v.localService) ??
    english[0] ??
    null
  );
}

function warmVoices() {
  if (cachedVoice || !("speechSynthesis" in window)) return;
  cachedVoice = pickVoice();
  if (!cachedVoice) {
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        cachedVoice = pickVoice();
      },
      { once: true }
    );
  }
}

// Synthesized speech from /api/tts, cached per text so replaying a sentence
// doesn't re-bill the TTS API. Returns null on any failure (caller falls back
// to browser speech synthesis).
const ttsCache = new Map<string, string>();

async function fetchTtsUrl(text: string): Promise<string | null> {
  const cached = ttsCache.get(text);
  if (cached) return cached;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const url = URL.createObjectURL(await res.blob());
    if (ttsCache.size >= 100) ttsCache.clear();
    ttsCache.set(text, url);
    return url;
  } catch {
    return null;
  }
}

export function AudioButton({ src, text, title, className }: AudioButtonProps) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Keep a live reference to the utterance: Chrome garbage-collects otherwise
  // unreferenced utterances mid-speech, cutting the audio off.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Bumped on every click; lets an in-flight TTS fetch detect it was cancelled.
  const playSeq = useRef(0);

  useEffect(() => {
    warmVoices();
  }, []);

  function speak() {
    if (!("speechSynthesis" in window)) {
      setPlaying(false);
      return;
    }
    const synth = window.speechSynthesis;

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    utterance.lang = "en-US";
    if (!cachedVoice) cachedVoice = pickVoice();
    if (cachedVoice) utterance.voice = cachedVoice;
    utterance.rate = 0.95;
    utterance.volume = 1;
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);

    // Chrome quirks: an utterance queued right after cancel() can be silently
    // dropped, so only cancel when something is actually queued, and give the
    // engine a beat before speaking. resume() unsticks a lingering paused
    // state, in which speak() queues but nothing plays.
    const pending = synth.speaking || synth.pending;
    if (pending) synth.cancel();
    window.setTimeout(
      () => {
        synth.speak(utterance);
        synth.resume();
      },
      pending ? 60 : 0
    );
  }

  function playUrl(url: string, onFail: () => void) {
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = onFail;
    audio.play().catch(onFail);
  }

  // Synthesized speech: OpenAI TTS via /api/tts, browser TTS as fallback.
  async function speakSynthesized(seq: number) {
    const url = await fetchTtsUrl(text);
    if (playSeq.current !== seq) return; // stopped while fetching
    if (url) {
      playUrl(url, speak);
    } else {
      speak();
    }
  }

  function play() {
    playSeq.current += 1;
    if (playing) {
      audioRef.current?.pause();
      audioRef.current = null;
      window.speechSynthesis?.cancel();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    if (src) {
      // Recorded pronunciation first; synthesized speech if it fails.
      playUrl(src, () => void speakSynthesized(playSeq.current));
    } else {
      void speakSynthesized(playSeq.current);
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
