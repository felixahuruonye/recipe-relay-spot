import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Star } from 'lucide-react';

export interface RewardBoxData {
  amount: number;
  currency: string;
  reasonLabel: string; // e.g. "Watch & Earn"
  newBalance?: number; // omitted from the copy if not known
}

interface RewardBoxPopupProps {
  data: RewardBoxData | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Audio: synthesized with Web Audio (no external file to host). All of it is
// kicked off from playSequence(), which is called on the double-tap gesture
// itself, so mobile autoplay policy is satisfied.
// ---------------------------------------------------------------------------
const useRewardAudio = () => {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = () => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  };

  // a) deep sub-bass pop - box opening
  const pop = (ctx: AudioContext, at: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, at);
    osc.frequency.exponentialRampToValueAtTime(35, at + 0.18);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(1, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.24);

    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'square';
    click.frequency.value = 90;
    clickGain.gain.setValueAtTime(0.4, at);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    click.connect(clickGain).connect(ctx.destination);
    click.start(at);
    click.stop(at + 0.05);
  };

  // b1) rising whistle - rocket launching
  const whistle = (ctx: AudioContext, at: number, duration: number, pan: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, at);
    osc.frequency.exponentialRampToValueAtTime(2200, at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.22, at + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    panner.pan.value = pan;
    osc.connect(gain).connect(panner).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  };

  // b2) heavy stereo thunder/crackle - firework detonation
  const thunder = (ctx: AudioContext, at: number, pan: number) => {
    const rumble = ctx.createOscillator();
    const rumbleGain = ctx.createGain();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(90, at);
    rumble.frequency.exponentialRampToValueAtTime(28, at + 0.5);
    rumbleGain.gain.setValueAtTime(0.0001, at);
    rumbleGain.gain.exponentialRampToValueAtTime(0.8, at + 0.02);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
    const rumblePan = ctx.createStereoPanner();
    rumblePan.pan.value = pan;
    rumble.connect(rumbleGain).connect(rumblePan).connect(ctx.destination);
    rumble.start(at);
    rumble.stop(at + 0.6);

    const bufferSize = Math.floor(ctx.sampleRate * 0.45);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const chan = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) chan[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) ** 1.5;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2200 + Math.random() * 800;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.55, at);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
    const noisePan = ctx.createStereoPanner();
    noisePan.pan.value = pan;
    noise.connect(filter).connect(noiseGain).connect(noisePan).connect(ctx.destination);
    noise.start(at);
  };

  // c) multi-pitch coin chime
  const coinChime = (ctx: AudioContext, at: number) => {
    const basePitches = [1568, 1760, 2093, 2349];
    const freq = basePitches[Math.floor(Math.random() * basePitches.length)];
    [1, 2].forEach((partial) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq * partial;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(partial === 1 ? 0.18 : 0.06, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.24);
    });
  };

  const playSequence = () => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;

      // Phase 2 (1.0s - 1.8s): pop, then 2 rocket launches + detonations
      pop(ctx, now + 1.0);
      whistle(ctx, now + 1.05, 0.3, -0.4);
      thunder(ctx, now + 1.4, -0.4);
      whistle(ctx, now + 1.25, 0.3, 0.5);
      thunder(ctx, now + 1.62, 0.5);

      // Phase 3 (1.8s - 3.5s): bigger detonations across the screen
      thunder(ctx, now + 1.9, -0.2);
      thunder(ctx, now + 2.3, 0.35);
      thunder(ctx, now + 2.8, -0.15);
      thunder(ctx, now + 3.2, 0.2);

      // coin chimes as coins land, spaced through phase 3
      for (let i = 0; i < 7; i++) {
        const t = now + 2.0 + i * 0.19 + Math.random() * 0.05;
        coinChime(ctx, t);
      }
    } catch {
      // Web Audio unsupported/blocked - visuals still carry the moment.
    }
  };

  return playSequence;
};

// ---------------------------------------------------------------------------
// Canvas particle system (canvas-confetti), capped to stay under ~180
// concurrent particles at any point so this doesn't lag low-end phones.
// ---------------------------------------------------------------------------
const runParticleSequence = (canvas: HTMLCanvasElement) => {
  const myConfetti = confetti.create(canvas, { resize: true, useWorker: true });
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

  const GOLD = ['#fde68a', '#facc15', '#f59e0b', '#fbbf24'];
  const GOLD_BLUE = ['#facc15', '#fbbf24', '#60a5fa', '#3b82f6', '#ffffff'];

  // Phase 2 (1000ms - 1800ms): box shatters into metallic debris + 2 rockets
  at(1000, () => {
    myConfetti({
      particleCount: 34,
      spread: 100,
      startVelocity: 32,
      gravity: 0.9,
      scalar: 0.85,
      ticks: 110,
      origin: { x: 0.5, y: 0.55 },
      colors: [...GOLD, '#e5e7eb', '#cbd5e1'],
      shapes: ['square', 'circle'],
    });
  });
  at(1050, () => {
    myConfetti({
      particleCount: 22,
      angle: 60,
      spread: 55,
      startVelocity: 48,
      gravity: 0.55,
      ticks: 100,
      origin: { x: 0.25, y: 0.6 },
      colors: GOLD_BLUE,
    });
  });
  at(1250, () => {
    myConfetti({
      particleCount: 22,
      angle: 120,
      spread: 55,
      startVelocity: 48,
      gravity: 0.55,
      ticks: 100,
      origin: { x: 0.75, y: 0.6 },
      colors: GOLD_BLUE,
    });
  });

  // Phase 3 (1800ms - 3500ms): full-screen gold + blue detonations
  [1900, 2300, 2800, 3200].forEach((delay, i) => {
    at(delay, () => {
      myConfetti({
        particleCount: 28,
        spread: 130,
        startVelocity: 50,
        gravity: 0.7,
        ticks: 120,
        origin: { x: 0.2 + Math.random() * 0.6, y: 0.15 + Math.random() * 0.35 },
        colors: i % 2 === 0 ? GOLD : ['#60a5fa', '#3b82f6', '#93c5fd', '#ffffff'],
      });
    });
  });

  // Coin rain: emoji-shaped coins falling with rotation, staggered through
  // phase 3, capped so total concurrent particles stay bounded.
  for (let i = 0; i < 7; i++) {
    at(1900 + i * 210, () => {
      myConfetti({
        particleCount: 4,
        angle: 270,
        spread: 65,
        startVelocity: 12,
        gravity: 0.9,
        drift: (Math.random() - 0.5) * 0.4,
        ticks: 220,
        scalar: 1.6,
        origin: { x: Math.random(), y: -0.05 },
        shapes: [confetti.shapeFromText({ text: '🪙' })],
      });
    });
  }

  // Continuous glitter/sparkle passing across the earnings text
  for (let i = 0; i < 5; i++) {
    at(2000 + i * 300, () => {
      myConfetti({
        particleCount: 6,
        spread: 360,
        startVelocity: 8,
        gravity: 0,
        ticks: 90,
        scalar: 0.5,
        origin: { x: 0.3 + Math.random() * 0.4, y: 0.42 + Math.random() * 0.1 },
        colors: ['#ffffff', '#fde68a'],
        shapes: ['star'],
      });
    });
  }

  return () => timers.forEach(clearTimeout);
};

export const RewardBoxPopup = ({ data, onClose }: RewardBoxPopupProps) => {
  const [phase, setPhase] = useState<'popup' | 'explode' | 'reveal'>('popup');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playAudio = useRewardAudio();

  const floatingParticles = useMemo(
    () =>
      Array.from({ length: 7 }).map(() => ({
        x: 20 + Math.random() * 60,
        y: 20 + Math.random() * 60,
        delay: Math.random() * 0.6,
      })),
    [data]
  );

  useEffect(() => {
    if (!data) return;
    setPhase('popup');
    playAudio();

    const explodeTimer = setTimeout(() => setPhase('explode'), 1000);
    const revealTimer = setTimeout(() => setPhase('reveal'), 1800);
    const closeTimer = setTimeout(() => onClose(), 5000);

    let cancelParticles: (() => void) | null = null;
    if (canvasRef.current) cancelParticles = runParticleSequence(canvasRef.current);

    return () => {
      clearTimeout(explodeTimer);
      clearTimeout(revealTimer);
      clearTimeout(closeTimer);
      cancelParticles?.();
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
          style={{ background: 'radial-gradient(circle at 50% 45%, rgba(35,15,55,0.6), rgba(0,0,0,0.9))' }}
        >
          {/* Canvas particle layer: shatter debris, rockets, full-screen bursts, coin rain, sparkle */}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

          {/* Phase 1: ambient floating light particles behind the box */}
          {phase === 'popup' &&
            floatingParticles.map((p, i) => (
              <motion.div
                key={i}
                className="absolute w-1.5 h-1.5 rounded-full bg-yellow-200"
                style={{ left: `${p.x}%`, top: `${p.y}%`, boxShadow: '0 0 8px 2px rgba(253,224,71,0.7)' }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 0.9, 0.4], scale: [0, 1, 1], y: [0, -10, 0] }}
                transition={{ duration: 1.8, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
              />
            ))}

          {/* Glowing aura pulse behind the box during phase 1 */}
          {phase === 'popup' && (
            <motion.div
              className="absolute w-40 h-40 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(250,204,21,0.35), transparent 70%)' }}
              animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.85, 0.5] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}

          {/* White flash at the moment of explosion */}
          <AnimatePresence>
            {phase === 'explode' && (
              <motion.div
                className="absolute inset-0 bg-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.85, 0] }}
                transition={{ duration: 0.3 }}
              />
            )}
          </AnimatePresence>

          {/* The gift box: bouncy pop-in, then lid pops open + base shatters away */}
          <AnimatePresence>
            {phase !== 'reveal' && (
              <div className="relative flex flex-col items-center">
                <motion.div
                  className="w-24 h-8 rounded-t-2xl z-10"
                  style={{ background: 'linear-gradient(145deg, #fbbf24, #f472b6)' }}
                  initial={{ scale: 0, y: 8 }}
                  animate={phase === 'popup' ? { scale: 1, y: 0 } : { y: -70, rotate: -35, opacity: 0 }}
                  transition={
                    phase === 'popup'
                      ? { duration: 0.6, ease: [0.175, 0.885, 0.32, 1.275] }
                      : { duration: 0.5, ease: 'easeOut' }
                  }
                />
                <motion.div
                  className="w-24 h-16 rounded-b-2xl -mt-1 flex items-center justify-center shadow-2xl overflow-hidden"
                  style={{ background: 'linear-gradient(145deg, #f59e0b, #ec4899, #8b5cf6)' }}
                  initial={{ scale: 0 }}
                  animate={phase === 'popup' ? { scale: 1 } : { scale: 1.4, opacity: 0 }}
                  transition={
                    phase === 'popup'
                      ? { duration: 0.6, ease: [0.175, 0.885, 0.32, 1.275] }
                      : { duration: 0.4, ease: 'easeOut' }
                  }
                >
                  <div className="w-3 h-full bg-white/30 absolute" />
                  <div className="h-3 w-full bg-white/30 absolute" />
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Phase 3: reward text - metallic gradient with shimmer sweep */}
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
                  className="flex items-center gap-2 text-4xl font-black leading-none bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      'linear-gradient(100deg, #fff7d6 0%, #facc15 20%, #b45309 40%, #facc15 60%, #fff7d6 80%, #facc15 100%)',
                    backgroundSize: '250% 100%',
                    filter: 'drop-shadow(0 0 18px rgba(250,204,21,0.6))',
                  }}
                  animate={{ backgroundPositionX: ['0%', '250%'] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
                >
                  <Star className="w-8 h-8 text-yellow-400 fill-yellow-400 drop-shadow shrink-0" />
                  +{data.amount.toLocaleString()} {data.currency} EARNED!
                </motion.div>
                <p className="mt-2 text-white/90 font-semibold text-base">
                  from "{data.reasonLabel}" activity
                </p>
                {typeof data.newBalance === 'number' && (
                  <p className="mt-1 text-white/70 text-sm">
                    New Balance: <span className="text-yellow-300 font-bold">{data.newBalance.toLocaleString()} {data.currency}</span>
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RewardBoxPopup;
