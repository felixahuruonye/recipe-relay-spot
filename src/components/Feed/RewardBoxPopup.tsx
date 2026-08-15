import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Star } from 'lucide-react';

export interface RewardBoxData {
  amount: number;
  currency: string;
  reasonLabel: string; // human label, e.g. "Watch reward" / "Story reward"
}

interface RewardBoxPopupProps {
  data: RewardBoxData | null;
  onClose: () => void;
}

const FIREWORK_COLORS = ['#facc15', '#f472b6', '#60a5fa', '#4ade80', '#fb923c', '#a78bfa', '#f87171'];

// ---------------------------------------------------------------------------
// Sound: synthesized with Web Audio so there's no external audio file to
// host/CORS-fight with. Fires from a real user gesture (the double-tap),
// so autoplay policies won't block it.
// ---------------------------------------------------------------------------
const useFireworksSound = () => {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = () => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  };

  const boom = (ctx: AudioContext, at: number) => {
    // Low sweeping thump
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, at);
    osc.frequency.exponentialRampToValueAtTime(40, at + 0.35);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.9, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.45);

    // Noise crackle
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1800;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, at);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
    noise.start(at);
  };

  const sparkle = (ctx: AudioContext, at: number) => {
    const notes = [1200, 1500, 1800, 2200];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = at + i * 0.07;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  };

  const playSequence = () => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;
      sparkle(ctx, now + 0.05); // shake/anticipation shimmer
      boom(ctx, now + 0.42); // box explodes
      boom(ctx, now + 0.9); // firework burst 1
      sparkle(ctx, now + 1.0);
      boom(ctx, now + 1.5); // firework burst 2
      sparkle(ctx, now + 1.65);
      boom(ctx, now + 2.15); // firework burst 3
    } catch {
      // Web Audio unsupported/blocked - fail silently, visuals still play.
    }
  };

  return playSequence;
};

// A single expanding firework burst of rays from a point.
const FireworkBurst = ({ x, y, color, delay }: { x: number; y: number; color: string; delay: number }) => {
  const rays = 14;
  return (
    <motion.div
      className="absolute"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ delay, duration: 1.1, times: [0, 0.15, 1] }}
    >
      {Array.from({ length: rays }).map((_, i) => {
        const angle = (i / rays) * Math.PI * 2;
        const dist = 60 + Math.random() * 40;
        return (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{ width: 5, height: 5, background: color, boxShadow: `0 0 6px 1px ${color}` }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist + 30, // slight gravity drift
              opacity: 0,
              scale: 0.3,
            }}
            transition={{ delay, duration: 1, ease: 'easeOut' }}
          />
        );
      })}
    </motion.div>
  );
};

// Confetti / coins raining from the top of the screen.
const FallingPiece = ({ x, delay, duration, kind, color }: { x: number; delay: number; duration: number; kind: 'confetti' | 'coin'; color: string }) => (
  <motion.div
    className="absolute top-0"
    style={{ left: `${x}%` }}
    initial={{ y: -40, opacity: 0, rotate: 0 }}
    animate={{ y: '115vh', opacity: [0, 1, 1, 0.8], rotate: 720 }}
    transition={{ delay, duration, ease: 'easeIn' }}
  >
    {kind === 'coin' ? (
      <div
        className="w-3.5 h-3.5 rounded-full border border-yellow-200"
        style={{ background: 'radial-gradient(circle at 35% 35%, #fff8dc, #facc15 60%, #b45309)' }}
      />
    ) : (
      <div className="w-2 h-3 rounded-sm" style={{ background: color }} />
    )}
  </motion.div>
);

export const RewardBoxPopup = ({ data, onClose }: RewardBoxPopupProps) => {
  const [phase, setPhase] = useState<'shake' | 'explode' | 'reveal'>('shake');
  const playSound = useFireworksSound();

  // Stable random particle layout for the lifetime of this one reward reveal.
  const fireworks = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, i) => ({
        x: 15 + Math.random() * 70,
        y: 10 + Math.random() * 45,
        color: FIREWORK_COLORS[i % FIREWORK_COLORS.length],
        delay: 0.9 + i * 0.35,
      })),
    [data]
  );

  const fallingPieces = useMemo(
    () =>
      Array.from({ length: 26 }).map((_, i) => ({
        x: Math.random() * 100,
        delay: 0.5 + Math.random() * 1.8,
        duration: 2.2 + Math.random() * 1.4,
        kind: (i % 3 === 0 ? 'coin' : 'confetti') as 'coin' | 'confetti',
        color: FIREWORK_COLORS[i % FIREWORK_COLORS.length],
      })),
    [data]
  );

  useEffect(() => {
    if (!data) return;
    setPhase('shake');
    playSound();
    const explodeTimer = setTimeout(() => setPhase('explode'), 420);
    const revealTimer = setTimeout(() => setPhase('reveal'), 620);
    const closeTimer = setTimeout(() => onClose(), 4200);
    return () => {
      clearTimeout(explodeTimer);
      clearTimeout(revealTimer);
      clearTimeout(closeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          className="absolute inset-0 z-[35] flex items-center justify-center overflow-hidden pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: 'radial-gradient(circle at 50% 40%, rgba(30,10,50,0.55), rgba(0,0,0,0.85))' }}
        >
          {/* Fireworks filling the screen */}
          {fireworks.map((fw, i) => (
            <FireworkBurst key={i} {...fw} />
          ))}

          {/* Coins + confetti raining down */}
          {fallingPieces.map((p, i) => (
            <FallingPiece key={i} {...p} />
          ))}

          {/* White flash at the moment of explosion */}
          <AnimatePresence>
            {phase === 'explode' && (
              <motion.div
                className="absolute inset-0 bg-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.9, 0] }}
                transition={{ duration: 0.35 }}
              />
            )}
          </AnimatePresence>

          {/* The box itself: shakes, then explodes away */}
          <AnimatePresence>
            {phase !== 'reveal' && (
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={
                  phase === 'shake'
                    ? { scale: 1, opacity: 1, rotate: [0, -6, 6, -6, 6, 0] }
                    : { scale: 2.2, opacity: 0 }
                }
                exit={{ opacity: 0 }}
                transition={phase === 'shake' ? { duration: 0.42, ease: 'easeInOut' } : { duration: 0.28 }}
                className="relative w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl"
                style={{ background: 'linear-gradient(145deg, #f59e0b, #ec4899, #8b5cf6)' }}
              >
                <Gift className="w-12 h-12 text-white drop-shadow" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Giant reward text */}
          <AnimatePresence>
            {phase === 'reveal' && (
              <motion.div
                initial={{ scale: 0.3, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                className="relative flex flex-col items-center px-6 text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex items-center gap-2 text-5xl font-black leading-none"
                  style={{
                    background: 'linear-gradient(180deg, #fff7d6, #facc15 55%, #ea580c)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 0 18px rgba(250,204,21,0.6))',
                  }}
                >
                  <Star className="w-9 h-9 text-yellow-400 fill-yellow-400 drop-shadow" />
                  +{data.amount.toLocaleString()} {data.currency}
                </motion.div>
                <p className="mt-3 text-white font-extrabold text-lg tracking-wide drop-shadow-lg">
                  {data.reasonLabel} Claimed!
                </p>
                <p className="mt-1 text-white/70 text-sm">Keep watching to earn more</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RewardBoxPopup;
