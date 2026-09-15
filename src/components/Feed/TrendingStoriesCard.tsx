import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sparkles, Eye, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TrendingStory {
  id: string;
  user_id: string;
  media_url: string | null;
  media_type: string | null;
  view_count: number | null;
  caption: string | null;
}

interface TrendingStoriesCardProps {
  isActive?: boolean;
  isMuted?: boolean;
}

const CARD_MS = 15000;

export const TrendingStoriesCard: React.FC<TrendingStoriesCardProps> = ({ isActive, isMuted }) => {
  const navigate = useNavigate();
  const [stories, setStories] = useState<TrendingStory[]>([]);
  const [idx, setIdx] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from('user_storylines')
        .select('id, user_id, media_url, media_type, view_count, caption')
        .eq('status', 'active')
        .gte('created_at', since)
        .order('view_count', { ascending: false })
        .limit(5); // only the first 5 auto-cycle - a "View More" tile follows
      const shuffled = ((data as any) || []).sort(() => Math.random() - 0.5);
      setStories(shuffled);
    })();
  }, []);

  const lastIndex = stories.length; // "View More Storylines" tile sits right after the last real card

  // Auto-advance every 5s, only while this slide is actually the active
  // one in the feed - it used to run all the time regardless of whether
  // the card was even on screen.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!isActive || stories.length === 0 || idx >= lastIndex) return;
    timerRef.current = setTimeout(() => {
      setDirection(1);
      setIdx((i) => Math.min(i + 1, lastIndex));
    }, CARD_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isActive, idx, stories.length, lastIndex]);

  const goNext = () => { setDirection(1); setIdx((i) => Math.min(i + 1, lastIndex)); };
  const goPrev = () => { setDirection(-1); setIdx((i) => Math.max(i - 1, 0)); };

  // Touch events (not Pointer events) - matches the swipe pattern used
  // elsewhere in this app and is the more reliable choice across mobile
  // browsers for a deliberate horizontal swipe gesture.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    swipedRef.current = false;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStartRef.current;
    touchStartRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      swipedRef.current = true;
      if (dx < 0) goNext(); else goPrev();
    }
  };
  // If the touch was a genuine swipe, swallow the click that would
  // otherwise also fire and navigate to the storyline page.
  const onCardClick = (e: React.MouseEvent) => {
    if (swipedRef.current) { e.preventDefault(); swipedRef.current = false; return; }
    navigate(`/storyline?story=${story!.id}`);
  };

  if (stories.length === 0) return null;

  const story = idx < stories.length ? stories[idx] : null;
  const isVideo = story?.media_type?.startsWith('video');

  return (
    <div className="w-full max-w-md mx-auto space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-bold">Trending Stories</span>
        </div>
        {story && <span className="text-[10px] text-muted-foreground">{idx + 1}/{stories.length}</span>}
      </div>

      <div
        className="relative aspect-[9/16] max-h-[65vh] select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          {story ? (
            <motion.div
              key={story.id}
              custom={direction}
              initial={{ x: direction === 1 ? 300 : -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction === 1 ? -300 : 300, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute inset-0"
            >
              <div className="product-card-glow rounded-2xl p-[3px] h-full">
                <button
                  onClick={onCardClick}
                  className="rounded-2xl h-full w-full overflow-hidden relative bg-black block"
                >
                  {story.media_url ? (
                    isVideo ? (
                      <video
                        src={story.media_url}
                        className="w-full h-full object-cover"
                        autoPlay={isActive}
                        muted={isMuted}
                        playsInline
                        controlsList="nodownload noremoteplayback noplaybackrate"
                        disablePictureInPicture
                        onContextMenu={(e) => e.preventDefault()}
                        onEnded={goNext}
                      />
                    ) : (
                      <img src={story.media_url} alt="" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/40 to-accent/40" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3">
                    <p className="text-white text-sm line-clamp-2 text-left">{story.caption || 'Trending now'}</p>
                    <p className="text-white/70 text-xs flex items-center gap-1 mt-1">
                      <Eye className="w-3.5 h-3.5" /> {story.view_count || 0} views
                    </p>
                  </div>
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="view-more-storylines"
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute inset-0"
            >
              <div className="product-card-glow rounded-2xl p-[3px] h-full">
                <button
                  onClick={() => navigate('/storyline')}
                  className="rounded-2xl h-full w-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-purple-900/40 via-pink-900/30 to-blue-900/40"
                >
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                    <ChevronRight className="w-8 h-8 text-white" />
                  </div>
                  <span className="text-white font-bold text-lg">View More Storylines</span>
                  <span className="text-white/60 text-xs">See everyone's stories</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {story && (
        <div className="flex gap-2 px-1">
          {stories.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= idx ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>
      )}
    </div>
  );
};

export default TrendingStoriesCard;
