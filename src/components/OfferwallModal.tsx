import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OfferwallModalProps {
  url: string;
  providerLabel: string;
  isLocker: boolean;
  onClose: () => void;
}

/**
 * Embeds a provider's offerwall or content locker in-app instead of a
 * new browser tab — spec #7's "responsive embedded offerwall" and
 * #10/#11's locker flow. The user completes the offer inside this
 * frame; the provider's own postback (fired to our server, not this
 * component) is what actually credits the reward — closing this modal
 * does nothing financial on its own.
 */
export const OfferwallModal: React.FC<OfferwallModalProps> = ({ url, providerLabel, isLocker, onClose }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 bg-background border-b border-border/60">
          <div>
            <p className="text-sm font-bold">{isLocker ? 'Unlock Content' : 'Complete Offer'}</p>
            <p className="text-[11px] text-muted-foreground">via {providerLabel} · closes automatically when done</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 relative bg-background">
          {!loaded && !failed && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          {failed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <p className="text-sm text-muted-foreground">
                {providerLabel} didn't load. It may be temporarily unavailable — try again shortly.
              </p>
              <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
            </div>
          ) : (
            <iframe
              src={url}
              className="w-full h-full border-0"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              title={`${providerLabel} ${isLocker ? 'locker' : 'offerwall'}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
            />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
