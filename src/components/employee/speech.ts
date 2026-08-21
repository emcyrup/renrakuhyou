'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 声での入力と読み上げ。どちらもブラウザの機能で行うため、追加の費用はかからない。
 * 対応していない端末（iOS の音声入力など）では使えないため、必ずキーボード入力も残す。
 */

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const holder = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return holder.SpeechRecognition ?? holder.webkitSpeechRecognition ?? null;
}

export function useVoiceInput(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const handler = useRef(onText);
  handler.current = onText;

  useEffect(() => {
    setSupported(recognitionClass() !== null);
    return () => recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognition = recognitionClass();
    if (!Recognition) return;

    const instance = new Recognition();
    instance.lang = 'ja-JP';
    instance.interimResults = false;
    instance.continuous = false;
    instance.onresult = (event) => {
      const text = Array.from({ length: event.results.length }, (_, index) => event.results[index][0].transcript).join(
        '',
      );
      if (text.trim()) handler.current(text.trim());
    };
    instance.onerror = () => setListening(false);
    instance.onend = () => setListening(false);

    recognition.current = instance;
    setListening(true);
    instance.start();
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, start, stop };
}

/** 連絡の読み上げ（点呼で「AI が伝える」ために使う）。 */
export function speak(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
