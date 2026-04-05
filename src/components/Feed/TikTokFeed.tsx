import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Heart, MessageCircle, Share2, Star, Volume2, VolumeX,
  Plus, Music2, Eye, UserPlus, Send, Copy, Disc,
  Home, Search, BookOpen, MessageSquare, Menu, X, Clock, Trash2, Edit, Flag, EyeOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { LoginModal } from './LoginModal';
import { CommentSection } from './CommentSection';
import { ensureUserProfile } from '@/lib/ensureUserProfile';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { SuggestedUsers } from './SuggestedUsers';
import { ProductCard } from './ProductCard';

interface Post {
  id: string;
  title: string;
  body: string;
  media_urls: string[];
  category: string;
  created_at: string;
  status: string;
  boosted: boolean;
  comments_count: number;
  likes_count: number;
  view_count: number;
  user_id: string;
  star_price?: number;
  media_type?: string;
  music_track_id?: string;
}

interface MusicTrack {
  id: string;
  title: string;
  artist_name: string;
  audio_url: string;
  source?: string;
}

interface UserProfile {
  id: string;
  username: string;
  avatar_url: string;
  vip: boolean;
  is_vip?: boolean;
  star_balance?: number;
  wallet_balance?: number;
}

interface Product {
  id: string;
  title: string;
  description: string;
  price_ngn: number;
  images: string[];
  seller_user_id: string;
}

// ── Star Notification Card ──
const StarNotificationCard: React.FC<{
  type: 'low' | 'empty' | 'no_earn' | 'first_time' | 'auto_spend_off';
  onBuyStars: () => void;
  onDismiss: () => void;
  onTurnOffAutoSpend?: () => void;
}> = ({ type, onBuyStars, onDismiss, onTurnOffAutoSpend }) => {
  const configs = {
    low: {
      title: "⭐ You're running low on stars",
      body: "Keep supporting creators you enjoy",
      btn1: { label: 'Buy Stars', action: onBuyStars },
      btn2: { label: 'Turn Off Auto Spend', action: onTurnOffAutoSpend || onDismiss },
    },
    empty: {
      title: "⭐ You've run out of stars",
      body: "Videos will continue without supporting creators, and Earnings will stop adding to Your Wallet",
      btn1: { label: 'Boost creators you love', action: onBuyStars },
      btn2: { label: 'Dismiss', action: onDismiss },
    },
    no_earn: {
      title: "You didn't earn from this post",
      body: "Buy Stars to earn from this post",
      btn1: { label: 'Get Stars ✨', action: onBuyStars },
      btn2: { label: 'Dismiss', action: onDismiss },
    },
    first_time: {
      title: "⭐ Support Creators Automatically",
      body: "When you watch, you support creators with stars and earn from their post for viewing, liking, commenting using stars ⭐. Buy stars from the star market to start earning!",
      btn1: { label: 'Get Free Star 🌟', action: onBuyStars },
      btn2: { label: 'Not Now', action: onDismiss },
    },
    auto_spend_off: {
      title: "⭐ Auto-Spend is OFF",
      body: "You're not earning from watching posts. Turn on Auto-Spend in Settings to start earning.",
      btn1: { label: 'Go to Settings', action: onBuyStars },
      btn2: { label: 'Dismiss', action: onDismiss },
    },
  };

  const cfg = configs[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-[400px]"
    >
      <div className="bg-card/95 backdrop-blur-xl rounded-2xl p-5 shadow-2xl border border-border">
        <h3 className="font-bold text-base mb-1">{cfg.title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{cfg.body}</p>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 gap-1" onClick={cfg.btn1.action}>
            {cfg.btn1.label}
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={cfg.btn2.action}>
            {cfg.btn2.label}
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

// ── Star Float Animation ──
const StarFloatAnimation: React.FC<{ amount: number; visible: boolean }> = ({ amount, visible }) => {
  if (!visible) return null;
  return (
    <motion.div
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: -40 }}
      exit={{ opacity: 0, y: -80 }}
      transition={{ duration: 2 }}
    >
      <div className="flex flex-col items-center gap-1">
        <motion.div
          animate={{ y: [-5, -30], opacity: [1, 0] }}
          transition={{ duration: 1.5, delay: 0.3 }}
        >
          <Star className="w-8 h-8 text-yellow-400 fill-yellow-400" />
        </motion.div>
        <motion.span
          className="text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-full"
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2, times: [0, 0.2, 0.7, 1] }}
        >
          +1 Support · ₦{amount.toFixed(0)} earned
        </motion.span>
      </div>
    </motion.div>
  );
};

// ── Search Overlay ──
const SearchOverlay: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<{ id: string; query: string }[]>([]);
  const [trending, setTrending] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    loadHistory();
    loadTrending();
  }, [open]);

  const loadHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('saved_searches')
      .select('id, query')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setHistory(data || []);
  };

  const loadTrending = async () => {
    const { data } = await supabase
      .from('search_trends')
      .select('keyword')
      .order('search_count', { ascending: false })
      .limit(8);
    setTrending(data?.map(d => d.keyword) || []);
  };

  const handleSearch = (q: string) => {
    if (!q.trim()) return;
    if (user) {
      supabase.from('saved_searches').insert({ user_id: user.id, query: q.trim() }).then(() => {});
      supabase.rpc('track_search', { search_keyword: q.trim() }).then(() => {});
    }
    navigate(`/explore?q=${encodeURIComponent(q.trim())}`);
    onClose();
  };

  const removeSearch = async (id: string) => {
    await supabase.from('saved_searches').delete().eq('id', id);
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  if (!open) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="max-w-[480px] mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch(query)}
              placeholder="Search posts, tags, users..."
              className="pl-9 h-10 bg-muted/50 border-border"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {history.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">Recent Searches</h3>
            <div className="space-y-1">
              {history.map(h => (
                <div key={h.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                  <button onClick={() => handleSearch(h.query)} className="flex items-center gap-2 flex-1 text-left">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm">{h.query}</span>
                  </button>
                  <button onClick={() => removeSearch(h.id)} className="p-1 text-muted-foreground hover:text-destructive">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {trending.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">🔥 Trending</h3>
            <div className="flex flex-wrap gap-2">
              {trending.map(t => (
                <button key={t} onClick={() => handleSearch(t)} className="px-3 py-1.5 rounded-full bg-muted text-xs font-medium hover:bg-primary/20 transition-colors">
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ── Sound Drill-down (CD icon) ──
const SoundDrilldown: React.FC<{
  open: boolean;
  onClose: () => void;
  trackName: string;
  trackArtist: string;
  trackId?: string;
  originalPostId?: string;
}> = ({ open, onClose, trackName, trackArtist, trackId, originalPostId }) => {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    loadPosts();
  }, [open, trackId]);

  const loadPosts = async () => {
    if (trackId) {
      const { data } = await supabase
        .from('posts')
        .select('id, title, media_urls, view_count')
        .eq('music_track_id', trackId)
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
        .limit(20);
      setPosts(data || []);
    }
  };

  if (!open) return null;

  return (
    <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        className="absolute bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-card rounded-t-2xl max-h-[70vh] overflow-hidden"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center animate-spin" style={{ animationDuration: '3s' }}>
                <Disc className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm">{trackName}</p>
                <p className="text-xs text-muted-foreground">{trackArtist}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground"><X className="w-5 h-5" /></button>
          </div>
          <Button size="sm" className="w-full mt-3 gap-2" onClick={() => { navigate('/create-post'); onClose(); }}>
            <Music2 className="w-4 h-4" /> Use this sound
          </Button>
        </div>
        <ScrollArea className="max-h-[calc(70vh-120px)]">
          <div className="p-4 grid grid-cols-3 gap-1">
            {posts.map((p, i) => (
              <div key={p.id} className="aspect-[9/16] rounded-lg overflow-hidden bg-muted relative">
                {p.media_urls?.[0] ? (
                  <img src={p.media_urls[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground p-2 text-center">{p.title}</div>
                )}
                <div className="absolute bottom-1 left-1 flex items-center gap-0.5 text-white text-[10px]">
                  <Eye className="w-3 h-3" /> {p.view_count || 0}
                </div>
                {i === 0 && (
                  <div className="absolute top-1 left-1 bg-primary px-1.5 py-0.5 rounded text-[8px] text-primary-foreground font-bold">
                    Original
                  </div>
                )}
              </div>
            ))}
            {posts.length === 0 && (
              <div className="col-span-3 py-8 text-center text-muted-foreground text-sm">No posts using this sound yet</div>
            )}
          </div>
        </ScrollArea>
      </motion.div>
    </motion.div>
  );
};

// ── Send to Friend ──
const SendToFriend: React.FC<{
  open: boolean;
  onClose: () => void;
  postId: string;
  postTitle: string;
  postThumbnail?: string;
}> = ({ open, onClose, postId, postTitle, postThumbnail }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [friends, setFriends] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    if (!open || !user) return;
    loadContacts();
  }, [open, user]);

  const loadContacts = async () => {
    if (!user) return;
    const { data: msgs } = await supabase
      .from('private_messages')
      .select('from_user_id, to_user_id')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(20);

    const contactIds = new Set<string>();
    msgs?.forEach(m => {
      if (m.from_user_id !== user.id) contactIds.add(m.from_user_id);
      if (m.to_user_id !== user.id) contactIds.add(m.to_user_id);
    });

    if (contactIds.size > 0) {
      const { data: profiles } = await supabase.from('user_profiles').select('id, username, avatar_url').in('id', [...contactIds]);
      setFriends(profiles || []);
    }

    const { data: grps } = await supabase
      .from('group_members')
      .select('group_id, groups(id, name, avatar_url)')
      .eq('user_id', user.id)
      .eq('status', 'active');
    setGroups(grps?.map((g: any) => g.groups).filter(Boolean) || []);
  };

  const sendToUser = async (toUserId: string) => {
    if (!user) return;
    const shareMsg = postThumbnail
      ? `📢 Shared: ${postTitle}\n🖼️ ${postThumbnail}\n${window.location.origin}/?post=${postId}`
      : `📢 Shared: ${postTitle}\n${window.location.origin}/?post=${postId}`;
    await supabase.from('private_messages').insert({
      from_user_id: user.id, to_user_id: toUserId, message: shareMsg,
      media_url: postThumbnail || null,
    });
    toast({ title: 'Sent!', description: 'Post shared to friend' });
    onClose();
  };

  const sendToGroup = async (groupId: string) => {
    if (!user) return;
    const shareMsg = postThumbnail
      ? `📢 Shared: ${postTitle}\n🖼️ ${postThumbnail}\n${window.location.origin}/?post=${postId}`
      : `📢 Shared: ${postTitle}\n${window.location.origin}/?post=${postId}`;
    await supabase.from('group_messages').insert({
      group_id: groupId, user_id: user.id, message: shareMsg,
      media_url: postThumbnail || null,
    });
    toast({ title: 'Sent!', description: 'Post shared to group' });
    onClose();
  };

  if (!open) return null;

  return (
    <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        className="absolute bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-card rounded-t-2xl max-h-[60vh] overflow-hidden"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">Send to</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <ScrollArea className="max-h-[calc(60vh-60px)]">
          <div className="p-4 space-y-3">
            {friends.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Friends</p>
                <div className="space-y-2">
                  {friends.map(f => (
                    <button key={f.id} onClick={() => sendToUser(f.id)} className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted/50">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={f.avatar_url} />
                        <AvatarFallback>{f.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{f.username}</span>
                      <Send className="w-4 h-4 ml-auto text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {groups.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Groups</p>
                <div className="space-y-2">
                  {groups.map((g: any) => (
                    <button key={g.id} onClick={() => sendToGroup(g.id)} className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted/50">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <MessageSquare className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium">{g.name}</span>
                      <Send className="w-4 h-4 ml-auto text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {friends.length === 0 && groups.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-6">No contacts yet</p>
            )}
          </div>
        </ScrollArea>
      </motion.div>
    </motion.div>
  );
};

// ── Share Menu with Edit/Delete/Report ──
const EnhancedShareMenu: React.FC<{
  open: boolean;
  onClose: () => void;
  post: Post;
  isOwnPost: boolean;
  onDelete?: () => void;
}> = ({ open, onClose, post, isOwnPost, onDelete }) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/?post=${post.id}`);
    toast({ title: 'Link copied!' });
    onClose();
  };

  const shareNative = async () => {
    try {
      await navigator.share({ title: post.title, url: `${window.location.origin}/?post=${post.id}` });
    } catch {}
    onClose();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this post permanently?')) return;
    await supabase.from('posts').delete().eq('id', post.id);
    toast({ title: 'Post deleted' });
    onDelete?.();
    onClose();
  };

  const handleHide = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('hidden_posts').insert({ post_id: post.id, user_id: user.id });
    toast({ title: 'Post hidden from your feed' });
    onClose();
  };

  const handleReport = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('post_reports').insert({ post_id: post.id, reporter_user_id: user.id, reason: 'Reported from feed' });
    toast({ title: 'Post reported' });
    onClose();
  };

  if (!open) return null;

  return (
    <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        className="absolute bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-card rounded-t-2xl overflow-hidden"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">Share & Actions</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-4 space-y-2">
          <button onClick={copyLink} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/50">
            <Copy className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm">Copy Link</span>
          </button>
          <button onClick={shareNative} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/50">
            <Share2 className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm">Share via...</span>
          </button>
          {isOwnPost && (
            <>
              <button onClick={() => { navigate(`/create-post?edit=${post.id}`); onClose(); }} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/50">
                <Edit className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm">Edit Post</span>
              </button>
              <button onClick={handleDelete} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-destructive/10 text-destructive">
                <Trash2 className="w-5 h-5" />
                <span className="text-sm">Delete Post</span>
              </button>
            </>
          )}
          {!isOwnPost && (
            <>
              <button onClick={handleHide} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/50">
                <EyeOff className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm">Remove from Feed</span>
              </button>
              <button onClick={handleReport} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-destructive/10 text-destructive">
                <Flag className="w-5 h-5" />
                <span className="text-sm">Report Post</span>
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Single full-screen post ──
const TikTokPost: React.FC<{
  post: Post;
  postUser?: UserProfile;
  musicTrack?: MusicTrack;
  isActive: boolean;
  isLiked: boolean;
  likesCount: number;
  commentsCount: number;
  viewCount: number;
  isFollowing: boolean;
  isOwnPost: boolean;
  isMuted: boolean;
  autoScroll: boolean;
  onToggleMute: () => void;
  onLike: () => void;
  onFollow: () => void;
  onComment: () => void;
  onShare: () => void;
  onSendToFriend: () => void;
  onSoundDrilldown: () => void;
  onProfile: () => void;
  onRequireLogin: (msg?: string) => void;
  onVideoEnd: () => void;
  onImageTimerEnd: () => void;
  onSendStar: () => void;
  isLoggedIn: boolean;
  hasSeenBefore?: boolean;
}> = ({
  post, postUser, musicTrack: mTrack, isActive, isLiked, likesCount, commentsCount, viewCount,
  isFollowing, isOwnPost, isMuted, autoScroll, onToggleMute, onLike, onFollow,
  onComment, onShare, onSendToFriend, onSoundDrilldown, onProfile, onRequireLogin, onVideoEnd, onImageTimerEnd, onSendStar, isLoggedIn, hasSeenBefore
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicAudioRef = useRef<HTMLAudioElement>(null);
  const [imageTimer, setImageTimer] = useState(5);
  const imageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasMedia = post.media_urls && post.media_urls.length > 0;
  const isVideo = hasMedia && (post.media_urls[0]?.match(/\.(mp4|webm|ogg|mov)$/i) || post.media_urls[0]?.includes('video'));

  // Background music
  useEffect(() => {
    if (!mTrack?.audio_url) return;
    const audio = new Audio(mTrack.audio_url);
    audio.loop = true;
    audio.volume = 0.3;
    musicAudioRef.current = audio;
    if (isActive && !isMuted) audio.play().catch(() => {});
    return () => { audio.pause(); audio.src = ''; };
  }, [mTrack?.audio_url]);

  useEffect(() => {
    if (musicAudioRef.current) {
      if (isActive && !isMuted) musicAudioRef.current.play().catch(() => {});
      else musicAudioRef.current.pause();
    }
  }, [isActive, isMuted]);

  // Video play/pause
  useEffect(() => {
    if (!videoRef.current) return;
    if (isActive) {
      videoRef.current.currentTime = 0;
      videoRef.current.muted = isMuted;
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isActive, isMuted]);

  // Image timer
  useEffect(() => {
    if (!isActive || isVideo) {
      setImageTimer(5);
      if (imageTimerRef.current) clearInterval(imageTimerRef.current);
      return;
    }
    setImageTimer(5);
    imageTimerRef.current = setInterval(() => {
      setImageTimer(prev => {
        if (prev <= 1) {
          clearInterval(imageTimerRef.current!);
          onImageTimerEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (imageTimerRef.current) clearInterval(imageTimerRef.current); };
  }, [isActive, isVideo]);

  const handleAction = (action: () => void, msg?: string) => {
    if (!isLoggedIn) { onRequireLogin(msg); return; }
    action();
  };

  const formatCount = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  return (
    <div className="relative w-full h-[100dvh] snap-start snap-always bg-black flex items-center justify-center overflow-hidden">
      {hasMedia && !isVideo && (
        <div className="absolute inset-0 bg-cover bg-center blur-2xl scale-110 opacity-30" style={{ backgroundImage: `url(${post.media_urls[0]})` }} />
      )}

      {hasMedia && isVideo ? (
        <video
          ref={videoRef}
          src={post.media_urls[0]}
          className="absolute inset-0 w-full h-full object-cover"
          loop={!autoScroll}
          playsInline
          muted={isMuted}
          onEnded={onVideoEnd}
          onClick={() => { if (videoRef.current?.paused) videoRef.current.play().catch(() => {}); else videoRef.current?.pause(); }}
        />
      ) : hasMedia ? (
        <img src={post.media_urls[0]} alt={post.title} className="relative z-10 max-w-full max-h-full object-contain" loading="lazy" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-accent/60 to-primary/40 flex items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-lg">
            <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">{post.title}</h2>
            <p className="text-white/80 text-base leading-relaxed">{post.body}</p>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none z-20" />

      {/* Earning labels */}
      {isActive && isVideo && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30">
          <span className="text-white/60 text-[10px] bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm">Watch To End To Earn</span>
        </div>
      )}
      {isActive && !isVideo && hasMedia && imageTimer > 0 && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30">
          <span className="text-white text-xs bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm font-mono">⏱ {imageTimer}s</span>
        </div>
      )}

      {isVideo && (
        <button onClick={onToggleMute} className="absolute top-20 right-4 z-30 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
          {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
        </button>
      )}

      {/* Right action rail */}
      <div className="absolute right-2 bottom-36 z-30 flex flex-col items-center gap-4">
        <div className="relative mb-1">
          <button onClick={onProfile}>
            <Avatar className="w-11 h-11 ring-2 ring-white/80 shadow-lg">
              <AvatarImage src={postUser?.avatar_url} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">{postUser?.username?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
            </Avatar>
          </button>
          {!isOwnPost && !isFollowing && (
            <button onClick={() => handleAction(onFollow, 'Login to follow')} className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center border-2 border-black">
              <Plus className="w-3 h-3 text-white" />
            </button>
          )}
        </div>

        <button onClick={() => handleAction(onLike, 'Login to like')} className="flex flex-col items-center gap-0.5">
          <Heart className={`w-7 h-7 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'} drop-shadow-lg`} />
          <span className="text-white text-[10px] font-bold">{formatCount(likesCount)}</span>
        </button>

        <button onClick={() => handleAction(onComment, 'Login to comment')} className="flex flex-col items-center gap-0.5">
          <MessageCircle className="w-7 h-7 text-white drop-shadow-lg" />
          <span className="text-white text-[10px] font-bold">{formatCount(commentsCount)}</span>
        </button>

        <div className="flex flex-col items-center gap-0.5">
          <Eye className="w-6 h-6 text-white/80 drop-shadow-lg" />
          <span className="text-white/80 text-[10px]">{formatCount(viewCount)}</span>
        </div>

        <button onClick={onShare} className="flex flex-col items-center gap-0.5">
          <Share2 className="w-6 h-6 text-white drop-shadow-lg" />
        </button>

        <button onClick={() => handleAction(onSendToFriend, 'Login to send')} className="flex flex-col items-center gap-0.5">
          <Send className="w-6 h-6 text-white drop-shadow-lg" />
        </button>

        {/* Send Star button for previously seen posts */}
        {hasSeenBefore && !isOwnPost && (
          <button onClick={() => handleAction(onSendStar, 'Login to send stars')} className="flex flex-col items-center gap-0.5">
            <Star className="w-6 h-6 text-yellow-400 drop-shadow-lg" />
            <span className="text-yellow-400 text-[8px] font-bold">Tip</span>
          </button>
        )}

        <button onClick={onSoundDrilldown} className="mt-1">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border-2 border-gray-500 flex items-center justify-center shadow-lg" style={{ animation: isActive ? 'spin 3s linear infinite' : 'none' }}>
            <Disc className="w-5 h-5 text-white/80" />
          </div>
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-20 left-3 right-16 z-30">
        <div className="space-y-1.5">
          <button onClick={onProfile} className="flex items-center gap-2">
            <span className="text-white font-bold text-sm drop-shadow-lg">@{postUser?.username || 'user'}</span>
            {(postUser?.vip || postUser?.is_vip) && (
              <Badge className="bg-yellow-400 text-black text-[9px] px-1.5 py-0 h-4 font-bold">VIP</Badge>
            )}
          </button>
          <p className="text-white text-sm leading-relaxed line-clamp-2 drop-shadow-lg">
            {post.title}
            {post.body && hasMedia && <span className="text-white/70"> {post.body.slice(0, 80)}</span>}
          </p>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] h-5 px-2 border-white/30 text-white bg-white/10">{post.category}</Badge>
            {post.star_price && post.star_price > 0 && (
              <Badge className="bg-yellow-500/90 text-black text-[10px] gap-0.5 font-bold">
                <Star className="w-3 h-3 fill-current" /> {post.star_price}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Music2 className={`w-3.5 h-3.5 ${mTrack ? 'text-white animate-pulse' : 'text-white/50'}`} />
            <span className="text-white/60 text-[11px] truncate max-w-[200px]">
              {mTrack ? `♪ ${mTrack.title} - ${mTrack.artist_name} (${mTrack.source === 'community' ? 'Community' : 'Lenory'})` : `Original sound - ${postUser?.username}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main TikTok Feed ──
const TikTokFeed: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [posts, setPosts] = useState<Post[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<Record<string, UserProfile>>({});
  const [postLikes, setPostLikes] = useState<Record<string, any[]>>({});
  const [postViewCounts, setPostViewCounts] = useState<Record<string, number>>({});
  const [postCommentCounts, setPostCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [autoScroll, setAutoScroll] = useState(false);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [activeSharePost, setActiveSharePost] = useState<Post | null>(null);
  const [showSendToFriend, setShowSendToFriend] = useState(false);
  const [activeSendPost, setActiveSendPost] = useState<Post | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showSoundDrilldown, setShowSoundDrilldown] = useState(false);
  const [activeSoundTrack, setActiveSoundTrack] = useState<{ name: string; artist: string; id?: string }>({ name: '', artist: '' });
  const [processedPosts, setProcessedPosts] = useState<Set<string>>(new Set());
  const [musicTracks, setMusicTracks] = useState<Record<string, MusicTrack>>({});
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatCount, setChatCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [autoSpend, setAutoSpend] = useState(false);
  const [starNotification, setStarNotification] = useState<'low' | 'empty' | 'no_earn' | 'first_time' | 'auto_spend_off' | null>(null);
  const [showStarFloat, setShowStarFloat] = useState(false);
  const [lastEarnAmount, setLastEarnAmount] = useState(0);
  const [showSuggestedUsers, setShowSuggestedUsers] = useState(false);
  const processingRef = useRef<Set<string>>(new Set());
  const feedRef = useRef<HTMLDivElement>(null);
  const viewCooldownRef = useRef<number>(0);
  const dailyViewsRef = useRef<number>(0);

  // Fetch posts
  useEffect(() => { fetchPosts(); fetchProducts(); }, []);

  // Load user data
  useEffect(() => {
    if (user) {
      loadFollowing();
      loadMyProfile();
      loadCounts();

      const channel = supabase
        .channel('feed-profile-updates')
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'user_profiles',
          filter: `id=eq.${user.id}`,
        }, (payload: any) => {
          setMyProfile(prev => prev ? { ...prev, ...payload.new } : null);
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  // Show first-time popup for new users
  useEffect(() => {
    if (user && myProfile) {
      const hasSeenPopup = localStorage.getItem(`lenory_first_popup_${user.id}`);
      if (!hasSeenPopup) {
        setTimeout(() => setStarNotification('first_time'), 2000);
      }
    }
  }, [user, myProfile]);

  // Load auto-spend setting
  useEffect(() => {
    if (myProfile) {
      const settings = (myProfile as any).story_settings;
      setAutoSpend(settings?.auto_spend || false);
    }
  }, [myProfile]);

  // Scroll tracking
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const handleScroll = () => {
      const scrollTop = el.scrollTop;
      const vh = window.innerHeight;
      const newIndex = Math.round(scrollTop / vh);
      if (newIndex !== activeIndex && newIndex >= 0 && newIndex < posts.length) {
        setActiveIndex(newIndex);
        if (navigator.vibrate) navigator.vibrate(10);
      }
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [activeIndex, posts.length]);

  // Show suggested users every 5 posts
  useEffect(() => {
    setShowSuggestedUsers(activeIndex > 0 && activeIndex % 5 === 0);
  }, [activeIndex]);

  // Record view when post changes
  useEffect(() => {
    if (posts.length === 0) return;
    const post = posts[activeIndex];
    if (!post) return;

    setPostViewCounts(prev => ({
      ...prev,
      [post.id]: (prev[post.id] ?? post.view_count ?? 0) + (prev[post.id] !== undefined ? 0 : 1)
    }));

    if (user && !processedPosts.has(post.id) && !processingRef.current.has(post.id)) {
      supabase.from('post_views').insert({ post_id: post.id, user_id: user.id }).then(() => {
        supabase.from('posts').update({ view_count: (post.view_count || 0) + 1 }).eq('id', post.id).then(() => {});
      });
    }
  }, [activeIndex, posts]);

  // Process earning
  const processEarning = useCallback((post: Post) => {
    if (!user || processedPosts.has(post.id) || processingRef.current.has(post.id)) return;
    if (post.user_id === user.id) return; // Can't earn from own content

    // Anti-abuse: cooldown
    const now = Date.now();
    if (now - viewCooldownRef.current < 10000) return; // 10s cooldown
    viewCooldownRef.current = now;

    // Daily limit
    if (dailyViewsRef.current >= 50) {
      toast({ title: 'Daily limit reached', description: 'Max 50 rewarded views per day' });
      return;
    }

    // Check auto-spend
    if (!autoSpend) {
      setStarNotification('auto_spend_off');
      return;
    }

    // Check star balance
    const starBal = myProfile?.star_balance || 0;
    if (starBal <= 0) {
      setStarNotification('no_earn');
      return;
    }
    if (starBal <= 3 && starBal > 0) {
      setStarNotification('low');
    }

    processingRef.current.add(post.id);
    dailyViewsRef.current += 1;

    (async () => {
      try {
        await ensureUserProfile(supabase as any, { id: user.id, email: user.email });
        const { data } = await supabase.rpc('process_post_view', { p_post_id: post.id, p_viewer_id: user.id });
        const result = data as any;
        if (result?.success) {
          setProcessedPosts(prev => new Set(prev).add(post.id));
          if (result.charged) {
            setLastEarnAmount(result.viewer_earn || 0);
            setShowStarFloat(true);
            setTimeout(() => setShowStarFloat(false), 2500);
            toast({ title: '💰 Earned!', description: `⭐ ${result.stars_spent} → ₦${result.viewer_earn} cashback` });
          } else if (result.insufficient_stars) {
            setStarNotification('no_earn');
          }
        }
      } finally {
        processingRef.current.delete(post.id);
      }
    })();
  }, [user, processedPosts, toast, autoSpend, myProfile]);

  const scrollToNext = useCallback(() => {
    if (!feedRef.current || !autoScroll) return;
    const nextIndex = activeIndex + 1;
    if (nextIndex < posts.length) {
      feedRef.current.scrollTo({ top: nextIndex * window.innerHeight, behavior: 'smooth' });
    }
  }, [activeIndex, posts.length, autoScroll]);

  const fetchPosts = async () => {
    try {
      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'approved')
        .eq('disabled', false)
        .order('boosted', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      const allPosts = postsData || [];
      if (allPosts.length > 0) {
        const userIds = [...new Set(allPosts.map(p => p.user_id))];
        const { data: usersData } = await supabase
          .from('user_profiles')
          .select('id, username, avatar_url, vip, is_vip')
          .in('id', userIds);

        const usersMap: Record<string, UserProfile> = {};
        usersData?.forEach(u => { usersMap[u.id] = u as UserProfile; });

        const { data: likesData } = await supabase
          .from('post_likes')
          .select('*')
          .in('post_id', allPosts.map(p => p.id));

        const likesMap: Record<string, any[]> = {};
        likesData?.forEach(l => {
          if (!likesMap[l.post_id]) likesMap[l.post_id] = [];
          likesMap[l.post_id].push(l);
        });

        const commentCountMap: Record<string, number> = {};
        const { data: commentCounts } = await supabase
          .from('post_comments')
          .select('post_id')
          .in('post_id', allPosts.map(p => p.id));
        commentCounts?.forEach(c => {
          commentCountMap[c.post_id] = (commentCountMap[c.post_id] || 0) + 1;
        });

        const viewCountMap: Record<string, number> = {};
        allPosts.forEach(p => { viewCountMap[p.id] = p.view_count || 0; });

        const musicTrackIds = allPosts.filter(p => p.music_track_id).map(p => p.music_track_id!);
        if (musicTrackIds.length > 0) {
          const { data: musicData } = await supabase
            .from('music_tracks')
            .select('id, title, artist_name, audio_url, source')
            .in('id', musicTrackIds);
          const mMap: Record<string, MusicTrack> = {};
          musicData?.forEach((m: any) => { mMap[m.id] = m; });
          setMusicTracks(mMap);
        }

        setPosts(allPosts);
        setUsers(usersMap);
        setPostLikes(likesMap);
        setPostCommentCounts(commentCountMap);
        setPostViewCounts(viewCountMap);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('status', 'active').limit(10);
    setProducts((data as any[]) || []);
  };

  const loadFollowing = async () => {
    if (!user) return;
    const { data } = await supabase.from('followers').select('following_id').eq('follower_id', user.id);
    setFollowingUsers(new Set(data?.map(f => f.following_id) || []));
  };

  const loadMyProfile = async () => {
    if (!user) return;
    const { data } = await (supabase as any).from('user_profiles').select('id, username, avatar_url, vip, is_vip, star_balance, wallet_balance, story_settings').eq('id', user.id).single();
    if (data) setMyProfile(data);
  };

  const loadCounts = async () => {
    if (!user) return;
    const { count: chats } = await supabase
      .from('private_messages')
      .select('*', { count: 'exact', head: true })
      .eq('to_user_id', user.id)
      .is('read_at', null);
    setChatCount(chats || 0);

    const { count: notifs } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setNotifCount(notifs || 0);
  };

  const handleLike = async (postId: string) => {
    if (!user) return;
    const existing = (postLikes[postId] || []).find((l: any) => l.user_id === user.id);
    if (existing) {
      await supabase.from('post_likes').delete().eq('id', existing.id);
      setPostLikes(prev => ({ ...prev, [postId]: (prev[postId] || []).filter((l: any) => l.id !== existing.id) }));
      await supabase.from('posts').update({ likes_count: Math.max((postLikes[postId]?.length || 1) - 1, 0) }).eq('id', postId);
    } else {
      const { data } = await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id }).select().single();
      if (data) {
        setPostLikes(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data] }));
        await supabase.from('posts').update({ likes_count: (postLikes[postId]?.length || 0) + 1 }).eq('id', postId);
      }
    }
  };

  const handleFollow = async (targetId: string) => {
    if (!user) return;
    if (followingUsers.has(targetId)) {
      await supabase.from('followers').delete().eq('follower_id', user.id).eq('following_id', targetId);
      setFollowingUsers(prev => { const n = new Set(prev); n.delete(targetId); return n; });
    } else {
      await supabase.from('followers').insert({ follower_id: user.id, following_id: targetId });
      setFollowingUsers(prev => new Set(prev).add(targetId));
    }
  };

  const handleSendStar = async (post: Post) => {
    toast({ title: '⭐ Send Stars', description: 'Star tipping coming soon!' });
  };

  const requireLogin = (msg?: string) => {
    setLoginMessage(msg || 'Sign in to continue');
    setShowLoginModal(true);
  };

  const handleStarNotificationAction = (type: string) => {
    if (type === 'auto_spend_off') {
      navigate('/settings');
    } else {
      navigate('/star-marketplace');
    }
    setStarNotification(null);
  };

  const handleTurnOffAutoSpend = async () => {
    if (!user) return;
    const { data: current } = await supabase.from('user_profiles').select('story_settings').eq('id', user.id).single();
    const existing = (current?.story_settings as any) || {};
    await supabase.from('user_profiles').update({ story_settings: { ...existing, auto_spend: false } }).eq('id', user.id);
    setAutoSpend(false);
    setStarNotification(null);
    toast({ title: '⭐ Auto-Spend OFF' });
  };

  const dismissFirstTimePopup = () => {
    if (user) localStorage.setItem(`lenory_first_popup_${user.id}`, 'true');
    setStarNotification(null);
  };

  const menuItems = [
    { icon: '🔔', label: 'Notifications', path: '/notifications', badge: notifCount },
    { icon: '🛒', label: 'Marketplace', path: '/marketplace' },
    { icon: '⭐', label: 'Buy Star To Earn', path: '/star-marketplace' },
    { icon: '👑', label: 'VIP Subscription', path: '/vip-subscription' },
    { icon: '💰', label: 'Wallet', path: '/wallet' },
    { icon: '🎤', label: 'Musician Dashboard', path: '/musician' },
    { icon: '👤', label: 'Profile', path: '/profile' },
    { icon: '📧', label: 'Contact Admin', path: '/contact-admin' },
    { icon: '🔗', label: 'Share Lenory', path: '/share' },
    { icon: '⚙️', label: 'Settings', path: '/settings' },
  ];

  if (loading) {
    return (
      <div className="h-[100dvh] bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="h-[100dvh] bg-black flex justify-center">
        <div className="relative w-full max-w-[480px] h-full">
          <div
            ref={feedRef}
            className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
            style={{ scrollSnapType: 'y mandatory' }}
          >
            {posts.length === 0 ? (
              <div className="h-[100dvh] flex items-center justify-center">
                <div className="text-center space-y-4">
                  <p className="text-5xl">🎬</p>
                  <h3 className="text-xl font-bold text-white">No content yet</h3>
                  <p className="text-white/60 text-sm">Be the first to post!</p>
                  <Button onClick={() => user ? navigate('/create-post') : requireLogin('Login to create posts')}>
                    <Plus className="w-4 h-4 mr-1" /> Create Post
                  </Button>
                </div>
              </div>
            ) : (
              posts.map((post, index) => (
                <React.Fragment key={post.id}>
                  <TikTokPost
                    post={post}
                    postUser={users[post.user_id]}
                    musicTrack={post.music_track_id ? musicTracks[post.music_track_id] : undefined}
                    isActive={index === activeIndex}
                    isLiked={(postLikes[post.id] || []).some((l: any) => l.user_id === user?.id)}
                    likesCount={postLikes[post.id]?.length || 0}
                    commentsCount={postCommentCounts[post.id] || 0}
                    viewCount={postViewCounts[post.id] || 0}
                    isFollowing={followingUsers.has(post.user_id)}
                    isOwnPost={post.user_id === user?.id}
                    isMuted={isMuted}
                    autoScroll={autoScroll}
                    onToggleMute={() => setIsMuted(!isMuted)}
                    onLike={() => handleLike(post.id)}
                    onFollow={() => handleFollow(post.user_id)}
                    onComment={() => { setActiveCommentPostId(post.id); setShowComments(true); }}
                    onShare={() => { setActiveSharePost(post); setShowShareMenu(true); }}
                    onSendToFriend={() => { setActiveSendPost(post); setShowSendToFriend(true); }}
                    onSoundDrilldown={() => {
                      const mTrack = post.music_track_id ? musicTracks[post.music_track_id] : undefined;
                      setActiveSoundTrack({
                        name: mTrack?.title || 'Original sound',
                        artist: mTrack?.artist_name || users[post.user_id]?.username || 'Unknown',
                        id: post.music_track_id || undefined,
                      });
                      setShowSoundDrilldown(true);
                    }}
                    onProfile={() => user ? navigate(`/profile/${post.user_id}`) : requireLogin('Login to view profiles')}
                    onRequireLogin={requireLogin}
                    onVideoEnd={() => {
                      const p = posts[activeIndex];
                      if (p && user) processEarning(p);
                      scrollToNext();
                    }}
                    onImageTimerEnd={() => {
                      const p = posts[activeIndex];
                      if (p && user) processEarning(p);
                      if (autoScroll) setTimeout(scrollToNext, 1000);
                    }}
                    onSendStar={() => handleSendStar(post)}
                    isLoggedIn={!!user}
                    hasSeenBefore={processedPosts.has(post.id)}
                  />
                  {/* Show suggested users every 5 posts */}
                  {index > 0 && index % 5 === 0 && index === activeIndex && showSuggestedUsers && (
                    <div className="h-[100dvh] snap-start snap-always bg-background flex items-center justify-center p-4">
                      <div className="w-full max-w-md">
                        <h3 className="text-lg font-bold mb-4 text-center">People You May Know</h3>
                        <SuggestedUsers />
                      </div>
                    </div>
                  )}
                  {/* Show marketplace product every 3 posts */}
                  {index > 0 && index % 3 === 0 && products[Math.floor(index / 3) % products.length] && (
                    <div className="h-[100dvh] snap-start snap-always bg-black flex items-center justify-center p-4">
                      <div className="w-full max-w-md">
                        <ProductCard product={products[Math.floor(index / 3) % products.length] as any} />
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))
            )}
          </div>

          {/* TOP HEADER */}
          <div className="absolute top-0 left-0 right-0 z-40 pointer-events-none">
            <div className="flex items-center justify-between px-3 pt-2 pointer-events-auto">
              <h1 className="text-lg font-black text-white drop-shadow-lg tracking-tight" style={{ fontFamily: 'system-ui' }}>
                Lenory
              </h1>
              <div className="flex items-center gap-2">
                {user && myProfile && (
                  <Badge className="bg-yellow-500 text-black text-[10px] gap-1 font-bold shadow-lg px-2">
                    <Star className="w-3 h-3 fill-current" /> {myProfile.star_balance || 0} Stars
                  </Badge>
                )}
                {user && (
                  <button onClick={() => navigate('/profile')}>
                    <Avatar className="w-7 h-7 ring-1 ring-white/50">
                      <AvatarImage src={myProfile?.avatar_url} />
                      <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">{myProfile?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-3 pt-1.5 pb-1 pointer-events-auto">
              <div className="flex items-center gap-2">
                {user && myProfile && (
                  <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1">
                    <span className="text-white font-bold text-xs">₦{(myProfile.wallet_balance || 0).toLocaleString()}</span>
                    <button onClick={() => { navigator.clipboard.writeText(String(myProfile.wallet_balance || 0)); toast({ title: 'Copied!' }); }} className="p-0.5">
                      <Copy className="w-3 h-3 text-white/60" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Switch checked={autoScroll} onCheckedChange={setAutoScroll} className="scale-75" />
                </div>
                <button onClick={() => setShowSearch(true)} className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                  <Search className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* BOTTOM NAVIGATION */}
          <div className="absolute bottom-0 left-0 right-0 z-40">
            <div className="flex items-center justify-around py-1.5 px-1 bg-black/80 backdrop-blur-md border-t border-white/10">
              <NavBtn icon={Home} label="Home" active onClick={() => feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
              <NavBtn icon={Search} label="Explore" onClick={() => navigate('/explore')} />
              <NavBtn icon={BookOpen} label="Stories" onClick={() => user ? navigate('/storylines') : requireLogin('Login for stories')} />
              <button
                onClick={() => user ? navigate('/create-post') : requireLogin('Login to post')}
                className="w-12 h-9 rounded-xl bg-primary flex items-center justify-center -mt-4 shadow-lg shadow-primary/40"
              >
                <Plus className="w-6 h-6 text-primary-foreground" />
              </button>
              <NavBtn icon={MessageCircle} label="Chat" badge={chatCount} onClick={() => user ? navigate('/chat') : requireLogin('Login to chat')} />
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <button className="flex flex-col items-center gap-0.5 relative">
                    <Menu className="w-5 h-5 text-white/50" />
                    <span className="text-[10px] text-white/50">Menu</span>
                    {notifCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center font-bold px-1">
                        {notifCount > 99 ? '99+' : notifCount}
                      </span>
                    )}
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[75vh]">
                  <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
                  <ScrollArea className="h-[calc(75vh-5rem)] mt-4">
                    <div className="space-y-1 pr-4">
                      {menuItems.map(item => (
                        <button
                          key={item.path}
                          onClick={() => {
                            setMenuOpen(false);
                            if (!user && item.path !== '/') requireLogin('Login to access ' + item.label);
                            else navigate(item.path);
                          }}
                          className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted transition-colors"
                        >
                          <span className="text-lg">{item.icon}</span>
                          <span className="flex-1 text-left text-sm">{item.label}</span>
                          {item.badge && item.badge > 0 && (
                            <Badge variant="destructive" className="text-[10px]">{item.badge > 99 ? '99+' : item.badge}</Badge>
                          )}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>

      {/* Star float animation */}
      <AnimatePresence>
        <StarFloatAnimation amount={lastEarnAmount} visible={showStarFloat} />
      </AnimatePresence>

      {/* Star notification cards */}
      <AnimatePresence>
        {starNotification && (
          <StarNotificationCard
            type={starNotification}
            onBuyStars={() => handleStarNotificationAction(starNotification)}
            onDismiss={() => starNotification === 'first_time' ? dismissFirstTimePopup() : setStarNotification(null)}
            onTurnOffAutoSpend={starNotification === 'low' ? handleTurnOffAutoSpend : undefined}
          />
        )}
      </AnimatePresence>

      {/* Comments */}
      <AnimatePresence>
        {showComments && activeCommentPostId && (
          <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowComments(false)} />
            <motion.div
              className="absolute bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-card rounded-t-2xl max-h-[60vh] overflow-hidden"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="font-bold text-sm">Comments</h3>
                <button onClick={() => setShowComments(false)} className="text-muted-foreground text-sm">✕</button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[calc(60vh-60px)]">
                <CommentSection postId={activeCommentPostId} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enhanced Share menu */}
      <AnimatePresence>
        {showShareMenu && activeSharePost && (
          <EnhancedShareMenu
            open={showShareMenu}
            onClose={() => setShowShareMenu(false)}
            post={activeSharePost}
            isOwnPost={activeSharePost.user_id === user?.id}
            onDelete={() => {
              setPosts(prev => prev.filter(p => p.id !== activeSharePost.id));
            }}
          />
        )}
      </AnimatePresence>

      {/* Send to friend */}
      <AnimatePresence>
        {showSendToFriend && activeSendPost && (
          <SendToFriend
            open={showSendToFriend}
            onClose={() => setShowSendToFriend(false)}
            postId={activeSendPost.id}
            postTitle={activeSendPost.title}
            postThumbnail={activeSendPost.media_urls?.[0]}
          />
        )}
      </AnimatePresence>

      {/* Sound drilldown */}
      <AnimatePresence>
        {showSoundDrilldown && (
          <SoundDrilldown
            open={showSoundDrilldown}
            onClose={() => setShowSoundDrilldown(false)}
            trackName={activeSoundTrack.name}
            trackArtist={activeSoundTrack.artist}
            trackId={activeSoundTrack.id}
          />
        )}
      </AnimatePresence>

      {/* Search overlay */}
      <AnimatePresence>
        {showSearch && <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />}
      </AnimatePresence>

      {/* Login modal */}
      <LoginModal open={showLoginModal} onOpenChange={setShowLoginModal} message={loginMessage} />
    </>
  );
};

// Nav button helper
const NavBtn: React.FC<{
  icon: React.FC<any>;
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
}> = ({ icon: Icon, label, active, badge, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-0.5 relative">
    <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-white/50'}`} />
    <span className={`text-[10px] ${active ? 'text-white font-bold' : 'text-white/50'}`}>{label}</span>
    {badge !== undefined && badge > 0 && (
      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center font-bold px-1">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

export default TikTokFeed;
