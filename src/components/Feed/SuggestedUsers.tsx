import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, ChevronRight, Search, Crown, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface UserSuggestion {
  id: string;
  username: string;
  avatar_url: string | null;
  vip: boolean | null;
  full_name: string | null;
}

interface SuggestedUsersProps {
  isActive?: boolean;
  isMuted?: boolean;
}

const CARD_MS = 4000;

export const SuggestedUsers: React.FC<SuggestedUsersProps> = ({ isActive, isMuted }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [allUsers, setAllUsers] = useState<UserSuggestion[]>([]);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followerSet, setFollowerSet] = useState<Set<string>>(new Set());
  const [interactedWith, setInteractedWith] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Carousel state
  const [cardIndex, setCardIndex] = useState(0); // 0..3 = profile cards, 4 = "view more" tile
  const [direction, setDirection] = useState<1 | -1>(1);
  const [autoPaused, setAutoPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartX = useRef<number | null>(null);

  // Background sound rotation
  const [sounds, setSounds] = useState<{ url: string }[]>([]);
  const soundVisitCountRef = useRef(0);
  const [currentSoundUrl, setCurrentSoundUrl] = useState<string | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => { if (user) loadSuggestions(); }, [user]);
  useEffect(() => { loadSounds(); }, []);

  const loadSounds = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('suggestion_card_sounds')
        .select('url')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setSounds((data as any[]) || []);
    } catch (error) {
      console.error('Error loading suggestion sounds (non-critical):', error);
    }
  };

  const loadSuggestions = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Race against a timeout so a slow/flaky connection can never leave
      // this stuck in "loading" forever - on a hung request there was
      // previously no fallback at all, and the card renders as nothing
      // (return null) the entire time loading is true. Whatever data did
      // resolve within the window still gets used below.
      const withTimeout = <T,>(p: PromiseLike<T>, ms = 6000): Promise<T | null> =>
        Promise.race([Promise.resolve(p), new Promise<null>((res) => setTimeout(() => res(null), ms))]);

      const followRes = await withTimeout(Promise.all([
        supabase.from('followers').select('following_id').eq('follower_id', user.id),
        supabase.from('followers').select('follower_id').eq('following_id', user.id),
      ]));
      const following = followRes?.[0]?.data;
      const followers = followRes?.[1]?.data;
      const followingIds = new Set(following?.map((f: any) => f.following_id) || []);
      const followerIds = new Set(followers?.map((f: any) => f.follower_id) || []);
      setFollowingSet(followingIds);
      setFollowerSet(followerIds);

      const usersRes: any = await withTimeout(
        supabase
          .from('user_profiles')
          .select('id, username, avatar_url, vip, full_name')
          .neq('id', user.id)
          .order('created_at', { ascending: false })
          .limit(500)
      );
      const list = usersRes?.data || [];
      setAllUsers(list);
      const followBacks = list.filter(u => followerIds.has(u.id) && !followingIds.has(u.id));
      const others = list.filter(u => !followerIds.has(u.id) && !followingIds.has(u.id));
      const finalList = shuffle([...followBacks, ...others]).slice(0, 12);
      setSuggestions(finalList);

      // Has the current user ever liked/viewed/commented on a post by any
      // of these suggested people? Nice-to-have label, not essential -
      // its own try/catch so a failure here never affects whether the
      // cards themselves show.
      try {
        const suggestedIds = finalList.map(u => u.id);
        if (suggestedIds.length === 0) return;
        const { data: theirPosts } = await supabase.from('posts').select('id, user_id').in('user_id', suggestedIds);
        const postIds = (theirPosts || []).map((p: any) => p.id);
        const ownerOf = new Map((theirPosts || []).map((p: any) => [p.id, p.user_id]));
        if (postIds.length === 0) return;
        const [{ data: likes }, { data: views }, { data: comments }] = await Promise.all([
          supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', postIds),
          supabase.from('post_views').select('post_id').eq('user_id', user.id).in('post_id', postIds),
          supabase.from('post_comments').select('post_id').eq('user_id', user.id).in('post_id', postIds),
        ]);
        const interacted = new Set<string>();
        [...(likes || []), ...(views || []), ...(comments || [])].forEach((row: any) => {
          const owner = ownerOf.get(row.post_id) as string | undefined;
          if (owner) interacted.add(owner);
        });
        setInteractedWith(interacted);
      } catch (err) {
        console.error('Error checking suggestion interactions (non-critical):', err);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      // Always runs, success or failure - this is the actual fix: nothing
      // can leave the card stuck invisible indefinitely anymore.
      setLoading(false);
    }
  };

  const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

  const handleFollow = async (targetId: string) => {
    if (!user) return;
    try {
      if (followingSet.has(targetId)) {
        await supabase.from('followers').delete().eq('follower_id', user.id).eq('following_id', targetId);
        setFollowingSet(prev => { const n = new Set(prev); n.delete(targetId); return n; });
      } else {
        await supabase.from('followers').insert({ follower_id: user.id, following_id: targetId });
        setFollowingSet(prev => new Set(prev).add(targetId));
        toast({ title: '✓ Following' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const cards = suggestions.slice(0, 4);
  const lastIndex = cards.length; // the "view more" tile sits right after the last real card

  const goNext = () => {
    setDirection(1);
    setAutoPaused(false);
    setCardIndex(i => Math.min(i + 1, lastIndex));
  };
  const goPrev = () => {
    setDirection(-1);
    setAutoPaused(true); // pause auto-advance on this card until the user manually moves forward again
    setCardIndex(i => Math.max(i - 1, 0));
  };

  // Auto-advance every 4s while this slide is the active one, not muted-
  // out of the loop, and not paused by a manual "go back".
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!isActive || autoPaused || loading || cards.length === 0) return;
    if (cardIndex >= lastIndex) return; // don't auto-advance past the "view more" tile
    timerRef.current = setTimeout(() => {
      setDirection(1);
      setCardIndex(i => Math.min(i + 1, lastIndex));
    }, CARD_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isActive, autoPaused, cardIndex, loading, cards.length, lastIndex]);

  // Rotate through the 5 background tracks - a new one each time this
  // slide becomes active again, looping the same one while it stays active.
  useEffect(() => {
    if (isActive && sounds.length > 0) {
      setCurrentSoundUrl(sounds[soundVisitCountRef.current % sounds.length]?.url);
      soundVisitCountRef.current += 1;
    }
  }, [isActive, sounds.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isActive && !isMuted && currentSoundUrl) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isActive, isMuted, currentSoundUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = !!isMuted;
  }, [isMuted]);

  const onPointerDown = (e: React.PointerEvent) => { dragStartX.current = e.clientX; };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const delta = e.clientX - dragStartX.current;
    dragStartX.current = null;
    if (delta < -50) goNext();
    else if (delta > 50) goPrev();
  };

  const filteredAll = searchQuery
    ? allUsers.filter(u =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allUsers;

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
        <div className="product-card-glow rounded-2xl p-[3px] h-[420px]">
          <div className="rounded-2xl h-full bg-muted flex items-center justify-center">
            <UserPlus className="w-10 h-10 text-muted-foreground/40" />
          </div>
        </div>
      </div>
    );
  }
  if (cards.length === 0) return null;

  const current = cardIndex < cards.length ? cards[cardIndex] : null;

  return (
    <>
      {currentSoundUrl && <audio ref={audioRef} src={currentSoundUrl} loop muted={isMuted} preload="auto" />}

      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" />
          People you may know
        </h3>
        <div className="flex gap-1">
          {cards.map((_, i) => (
            <div key={i} className={`h-1 w-4 rounded-full ${i === cardIndex ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>
      </div>

      <div
        className="relative h-[420px] select-none touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          {current ? (
            <motion.div
              key={current.id}
              custom={direction}
              initial={{ x: direction === 1 ? 300 : -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction === 1 ? -300 : 300, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute inset-0"
            >
              <div className="product-card-glow rounded-2xl p-[3px] h-full">
                <div className="rounded-2xl h-full overflow-hidden relative bg-muted">
                  {current.avatar_url ? (
                    <img src={current.avatar_url} alt={current.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/30 to-primary/10">
                      <span className="text-6xl font-bold text-primary/60">{current.username[0]?.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                  <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
                    <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => navigate(`/profile/${current.id}`)}>
                      <span className="text-white font-bold text-lg drop-shadow">{current.username}</span>
                      {current.vip && <Crown className="w-4 h-4 text-yellow-400" />}
                    </div>
                    <p className="text-white/80 text-xs flex items-center gap-1">
                      {interactedWith.has(current.id) ? (
                        <><Heart className="w-3 h-3" /> Interacted with one of their posts</>
                      ) : (
                        'Suggested for you'
                      )}
                    </p>
                    <Button
                      className="w-full"
                      variant={followingSet.has(current.id) ? 'outline' : 'default'}
                      onClick={() => handleFollow(current.id)}
                    >
                      {followingSet.has(current.id) ? 'Following' : followerSet.has(current.id) ? 'Follow Back' : 'Follow'}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="view-more"
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <button onClick={() => setShowAll(true)} className="flex flex-col items-center gap-3">
                <div className="product-card-glow rounded-full p-[3px]">
                  <div className="rounded-full w-20 h-20 flex items-center justify-center bg-card border">
                    <ChevronRight className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <span className="text-sm font-semibold text-muted-foreground">View More</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Discover People
            </DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[55vh]">
            {filteredAll.map(u => {
              const followsMe = followerSet.has(u.id);
              const iFollow = followingSet.has(u.id);
              return (
                <div key={u.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                  <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => { setShowAll(false); navigate(`/profile/${u.id}`); }}>
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={u.avatar_url || ''} />
                      <AvatarFallback>{u.username[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sm truncate">{u.username}</span>
                        {u.vip && <Crown className="w-3 h-3 text-yellow-500" />}
                      </div>
                      {followsMe && <span className="text-[10px] text-primary">Follows you</span>}
                    </div>
                  </div>
                  <Button size="sm" variant={iFollow ? 'outline' : 'default'} onClick={() => handleFollow(u.id)}>
                    {iFollow ? 'Following' : followsMe ? 'Follow back' : 'Follow'}
                  </Button>
                </div>
              );
            })}
            {filteredAll.length === 0 && <p className="text-center text-muted-foreground py-4">No users found</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
