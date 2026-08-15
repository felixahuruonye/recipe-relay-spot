import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Gift } from 'lucide-react';

export interface RewardBoxData {
  amount: number;
  currency: string;
  reasonLabel: string; // human label, e.g. "Watch reward" / "Story reward"
}

interface RewardBoxPopupProps {
  data: RewardBoxData | null;
  onClose: () => void;
}

// The "box opens mid-scroll" hook, modeled on the moment Cheelee uses to
// make watch-to-earn feel tangible: don't just tick a number up quietly in
// a wallet screen the user isn't looking at - stop them for one beat with
// something that visibly opens and pays out, then get out of the way fast
// (auto-dismiss) so it never blocks the scroll like a modal would.
export const RewardBoxPopup = ({ data, onClose }: RewardBoxPopupProps) => {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!data) return;
    setOpened(false);
    const openTimer = setTimeout(() => setOpened(true), 400);
    const closeTimer = setTimeout(() => onClose(), 2600);
    return () => { clearTimeout(openTimer); clearTimeout(closeTimer); };
  }, [data, onClose]);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          className="fixed inset-x-0 top-20 z-[70] flex justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.4, y: -20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="relative flex flex-col items-center"
          >
            <motion.div
              animate={opened ? { rotate: [0, -8, 8, -4, 0] } : {}}
              transition={{ duration: 0.5 }}
              className="relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl"
              style={{
                background: 'linear-gradient(145deg, #f59e0b, #ec4899, #8b5cf6)',
              }}
            >
              <Gift className="w-8 h-8 text-white drop-shadow" />

              {/* Burst rays on open */}
              {opened && (
                <>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 1, x: 0, y: 0, scale: 0.5 }}
                      animate={{ opacity: 0, x: Math.cos((i / 8) * Math.PI * 2) * 34, y: Math.sin((i / 8) * Math.PI * 2) * 34, scale: 1 }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="absolute w-1.5 h-1.5 rounded-full bg-yellow-300"
                    />
                  ))}
                </>
              )}
            </motion.div>

            <AnimatePresence>
              {opened && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.8 }}
                  animate={{ opacity: 1, y: 4, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 bg-black/85 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg"
                >
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                  <span className="text-white text-sm font-bold">
                    +{data.amount.toLocaleString()} {data.currency}
                  </span>
                  <span className="text-white/60 text-xs">{data.reasonLabel}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RewardBoxPopup;
