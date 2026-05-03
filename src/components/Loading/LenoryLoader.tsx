import { useEffect, useState } from "react";

const PHRASES = ["Connect", "Learn", "Share", "& Earn with Lenory"];

interface LenoryLoaderProps {
  fullscreen?: boolean;
  label?: string;
}

export const LenoryLoader = ({ fullscreen = false, label }: LenoryLoaderProps) => {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [text, setText] = useState("");

  useEffect(() => {
    let charIdx = 0;
    const phrase = PHRASES[phraseIdx];
    setText("");
    const typer = setInterval(() => {
      charIdx++;
      setText(phrase.slice(0, charIdx));
      if (charIdx >= phrase.length) {
        clearInterval(typer);
        setTimeout(() => setPhraseIdx((i) => (i + 1) % PHRASES.length), 700);
      }
    }, 60);
    return () => clearInterval(typer);
  }, [phraseIdx]);

  const wrapper = fullscreen
    ? "fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm"
    : "flex flex-col items-center justify-center py-12 gap-4";

  return (
    <div className={wrapper} role="status" aria-live="polite">
      <div className="relative w-24 h-24">
        <div
          className="absolute inset-0 rounded-2xl animate-spin-slow"
          style={{
            background:
              "conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #10b981, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
            filter: "blur(2px)",
          }}
        />
        <div className="absolute inset-1 rounded-2xl bg-background flex items-center justify-center text-3xl font-black bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 bg-clip-text text-transparent">
          L
        </div>
      </div>
      <div className="h-6 text-base font-semibold bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 bg-clip-text text-transparent">
        {text}
        <span className="animate-pulse">|</span>
      </div>
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <style>{`@keyframes spin-slow { to { transform: rotate(360deg); } } .animate-spin-slow { animation: spin-slow 3s linear infinite; }`}</style>
    </div>
  );
};

export default LenoryLoader;
