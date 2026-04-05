import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageCircle, Star, Eye, Share2, Volume2, VolumeX, Zap, Timer, UserPlus, ToggleLeft, ToggleRight, Plus, TrendingUp, ChevronUp, ShieldAlert, Coins } from 'lucide-react';
import { EnhancedStorylineViewer } from '@/components/Storyline/EnhancedStorylineViewer';
import { CreateStoryline } from '@/components/Storyline/CreateStoryline';
import { StorylineCard } from '@/components/Storyline/StorylineCard';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CreatePostWizard from '@/components/Posts/CreatePostWizard';
import OnboardingFlow from '@/components/Onboarding/OnboardingFlow';
import ProfileSetup from '@/components/Profile/ProfileSetup';
import NewSearchBar from '@/components/Search/NewSearchBar';
import { CommentSection } from '@/components/Feed/CommentSection';
import { ShareMenu } from '@/components/Feed/ShareMenu';
import { PostMenu } from '@/components/Feed/PostMenu';
import { PostViewers } from '@/components/Profile/PostViewers';
import { ProductCard } from '@/components/Feed/ProductCard';
import { SuggestedUsers } from '@/components/Feed/SuggestedUsers';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ensureUserProfile } from '@/lib/ensureUserProfile';
import { motion, AnimatePresence } from 'framer-motion';

interface Post {
  id: string;
  title: string;
  body: string;
  media_urls: string[];
  category: string;
  created_at: string;
  status: string;
  boosted: boolean;
  boost_until: string | null;
  comments_count: number;
  likes_count: number;
  view_count: number;
  rating: number;
  user_id: string;
  star_price?: number;
  media_type?: string;
}

interface UserProfile {
  id: string;
  username: string;
  avatar_url: string;
  vip: boolean;
}

interface PostLike {
  id: string;
  user_id: string;
  post_id: string;
}

// ── Star Gate Card ──
const StarGateCard: React.FC<{
  starPrice: number;
  userStars: number;
  onTopUp: () => void;
  onSkip: () => void;
}> = ({ starPrice, userStars, onTopUp, onSkip }) => (
  <motion.div
    className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-20 rounded-2xl"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
  >
    <motion.div
      className="bg-card rounded-2xl p-5 mx-4 max-w-xs w-full shadow-2xl border border-border"
      initial={{ scale: 0.85, y: 20 }}
      animate={{ scale: 1, y: 0 }}
    >
      <div className="text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-yellow-500/20 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7 text-yellow-500" />
        </div>
        <h3 className="font-bold text-base">Can't Earn From This Post</h3>
        <p className="text-sm text-muted-foreground">
          This post requires <span className="font-bold text-yellow-500">{starPrice} ⭐</span> to watch & earn.
          You have <span className="font-bold">{userStars} ⭐</span>.
        </p>
        <p className="text-xs text-muted-foreground">Top up your Star balance to earn from this post, or scroll to the next one.</p>
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1 gap-1.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold hover:from-yellow-400 hover:to-orange-400"
            onClick={onTopUp}
          >
            <Coins className="w-4 h-4" /> Top Up Stars
          </Button>
          <Button variant="outline" className="flex-1" onClick={onSkip}>
            Cancel
          </Button>
        </div>
      </div>
    </motion.div>
  </motion.div>
);

// ── Earnings Toast Card ──
const EarningsPopup: React.FC<{
  amount: number;
  starsSpent: number;
  onDismiss: () => void;
}> = ({ amount, starsSpent, onDismiss }) => (
  <motion.div
    className="absolute top-3 left-3 right-3 z-30"
    initial={{ opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
  >
    <div className="bg-green-500/95 rounded-xl p-3 shadow-lg flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
        <Zap className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 text-white">
        <p className="font-bold text-sm">You Earned! 💰</p>
        <p className="text-xs opacity-90">⭐ {starsSpent} Stars → ₦{amount} cashback!</p>
      </div>
      <button onClick={onDismiss} className="text-white/70 hover:text-white text-xs font-medium">OK</button>
    </div>
  </motion.div>
);

// ── Feed Post Card ──
const FeedPostCard: React.FC<{
  post: Post;
  postUser?: UserProfile;
  isLiked: boolean;
  likesCount: number;
  commentsCount: number;
  isProcessed: boolean;
  isFollowing: boolean;
  isOwnPost: boolean;
  userId?: string;
  userStarBalance: number;
  onLike: () => void;
  onFollow: () => void;
  onProfile: () => void;
  onProcessView: () => void;
  onFetchPosts: () => void;
  onStarGateSkip: () => void;
  onAutoScrollComplete?: () => void;
}> = ({ post, postUser, isLiked, likesCount, commentsCount, isProcessed, isFollowing, isOwnPost, userId, userStarBalance, onLike, onFollow, onProfile, onProcessView, onFetchPosts, onStarGateSkip, onAutoScrollComplete }) => {
  const [showComments, setShowComments] = useState(false);
  const [viewProgress, setViewProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [showStarGate, setShowStarGate] = useState(false);
  const [showEarnings, setShowEarnings] = useState<{ amount: number; stars: number } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const hasProcessedRef = useRef(false);
  const hasCheckedGateRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const hasMedia = post.media_urls && post.media_urls.length > 0;
  const isVideo = hasMedia && (post.media_urls[0]?.match(/\.(mp4|webm|ogg|mov)$/i) || post.media_urls[0]?.includes('video'));
  const viewDuration = 30;
  const starPrice = post.star_price || 0;
  const needsStars = starPrice > 0 && !isOwnPost && userStarBalance < starPrice;

  // Intersection observer
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const inView = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        setIsInView(inView);

        if (inView) {
          // Star gate check
          if (needsStars && !hasCheckedGateRef.current && !isProcessed) {
            hasCheckedGateRef.current = true;
            setShowStarGate(true);
            return;
          }

          if (showStarGate) return;

          // Auto-play video
          if (isVideo && videoRef.current) {
            videoRef.current.muted = isMuted;
            videoRef.current.play().catch(() => {});
          }
          // Start view timer for images
          if (!hasProcessedRef.current && !isProcessed && !needsStars) {
            startTimeRef.current = Date.now();
            timerRef.current = setInterval(() => {
              const elapsed = (Date.now() - startTimeRef.current) / 1000;
              if (!isVideo) {
                const progress = Math.min((elapsed / viewDuration) * 100, 100);
                setViewProgress(progress);
                if (progress >= 100 && !hasProcessedRef.current) {
                  hasProcessedRef.current = true;
                  onProcessView();
                  if (timerRef.current) clearInterval(timerRef.current);
                  // Auto-scroll after image timer
                  setTimeout(() => onAutoScrollComplete?.(), 800);
                }
              }
            }, 200);
          }
        } else {
          if (isVideo && videoRef.current) videoRef.current.pause();
          if (timerRef.current) clearInterval(timerRef.current);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => { observer.disconnect(); if (timerRef.current) clearInterval(timerRef.current); };
  }, [isProcessed, isMuted, showStarGate, needsStars]);

  useEffect(() => {
    hasProcessedRef.current = isProcessed;
    hasCheckedGateRef.current = false;
    setViewProgress(isProcessed ? 100 : 0);
    setShowStarGate(false);
    setShowEarnings(null);
  }, [post.id, isProcessed]);

  const handleVideoEnded = () => {
    if (!hasProcessedRef.current && !isProcessed) {
      hasProcessedRef.current = true;
      setViewProgress(100);
      onProcessView();
      // Auto-scroll after video ends
      setTimeout(() => onAutoScrollComplete?.(), 800);
    }
  };

  // Show earnings popup when processed
  const handleProcessViewWithEarnings = () => {
    onProcessView();
  };

  const handleStarGateSkip = () => {
    setShowStarGate(false);
    onStarGateSkip();
  };

  const timeAgo = (date: string) => {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  return (
    <motion.div
      ref={cardRef}
      className="relative bg-card rounded-2xl overflow-hidden border border-border/50 shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Star Gate overlay */}
      <AnimatePresence>
        {showStarGate && (
          <StarGateCard
            starPrice={starPrice}
            userStars={userStarBalance}
            onTopUp={() => navigate('/star-marketplace')}
            onSkip={handleStarGateSkip}
          />
        )}
      </AnimatePresence>

      {/* Earnings popup */}
      <AnimatePresence>
        {showEarnings && (
          <EarningsPopup
            amount={showEarnings.amount}
            starsSpent={showEarnings.stars}
            onDismiss={() => setShowEarnings(null)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between p-3 pb-2">
        <div className="flex items-center gap-2.5">
          <Avatar className="w-9 h-9 cursor-pointer ring-2 ring-primary/20" onClick={onProfile}>
            <AvatarImage src={postUser?.avatar_url} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
              {postUser?.username?.charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-1.5">
              <button onClick={onProfile} className="font-semibold text-sm hover:underline">
                {postUser?.username}
              </button>
              {postUser?.vip && (
                <Badge className="bg-yellow-400 text-black text-[9px] px-1 py-0 h-4">VIP</Badge>
              )}
              <span className="text-muted-foreground text-xs">· {timeAgo(post.created_at)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">{post.category}</Badge>
              {post.boosted && <Badge className="bg-orange-500 text-white text-[9px] h-4 px-1">🔥 Hot</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isOwnPost && !isFollowing && (
            <Button size="sm" variant="outline" className="h-7 text-xs px-2 gap-1" onClick={onFollow}>
              <UserPlus className="w-3 h-3" /> Follow
            </Button>
          )}
          <PostMenu postId={post.id} postOwnerId={post.user_id} onPostDeleted={onFetchPosts} />
        </div>
      </div>

      {/* Title */}
      <div className="px-3 pb-2">
        <h3 className="font-bold text-sm leading-snug">{post.title}</h3>
        {post.body && !hasMedia && (
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{post.body}</p>
        )}
      </div>

      {/* Star Price */}
      {starPrice > 0 && !isOwnPost && (
        <div className="px-3 pb-2">
          <Badge className="bg-yellow-500/90 text-black gap-1">
            <Star className="w-3 h-3 fill-current" />
            {starPrice} Stars to watch & earn
          </Badge>
        </div>
      )}

      {/* Media */}
      {hasMedia && (
        <div className="relative w-full" style={{ aspectRatio: isVideo ? '9/16' : '4/5', maxHeight: '70vh' }}>
          {isVideo ? (
            <>
              <video
                ref={videoRef}
                src={post.media_urls[0]}
                className="w-full h-full object-cover bg-black"
                loop={false}
                playsInline
                muted={isMuted}
                onEnded={handleVideoEnded}
                onClick={() => {
                  if (videoRef.current?.paused) videoRef.current.play().catch(() => {});
                  else videoRef.current?.pause();
                }}
              />
              <button
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (videoRef.current) videoRef.current.muted = !isMuted;
                }}
                className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center z-10"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
              </button>
            </>
          ) : (
            <img
              src={post.media_urls[0]}
              alt={post.title}
              className="w-full h-full object-cover cursor-pointer"
              loading="lazy"
              onClick={() => navigate(`/profile/${post.user_id}`)}
            />
          )}

          {/* View progress bar */}
          {!isProcessed && isInView && !showStarGate && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
              <motion.div
                className="h-full bg-gradient-to-r from-green-400 to-emerald-500"
                animate={{ width: `${viewProgress}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
          )}

          {/* Timer badge */}
          {!isProcessed && isInView && !isVideo && viewProgress < 100 && !showStarGate && (
            <div className="absolute top-3 right-3">
              <Badge className="bg-black/60 text-white text-[10px] gap-1 animate-pulse">
                <Timer className="w-3 h-3" />
                {Math.ceil(viewDuration - (viewDuration * viewProgress / 100))}s
              </Badge>
            </div>
          )}

          {isProcessed && (
            <div className="absolute top-3 right-3">
              <Badge className="bg-green-500 text-white text-[10px] gap-1">
                <Zap className="w-3 h-3" /> Earned ✓
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* Caption */}
      {hasMedia && post.body && (
        <p className="px-3 pt-2 text-sm text-muted-foreground line-clamp-2">{post.body}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-4">
          <motion.button whileTap={{ scale: 1.3 }} onClick={onLike} className="flex items-center gap-1.5">
            <Heart className={`w-6 h-6 transition-colors ${isLiked ? 'fill-red-500 text-red-500' : 'text-muted-foreground hover:text-red-400'}`} />
            <span className="text-sm font-semibold">{likesCount}</span>
          </motion.button>
          <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-1.5">
            <MessageCircle className="w-5.5 h-5.5 text-muted-foreground hover:text-primary transition-colors" />
            <span className="text-sm font-semibold">{commentsCount}</span>
          </button>
          <ShareMenu postId={post.id} postTitle={post.title} postImage={hasMedia ? post.media_urls[0] : undefined} postDescription={post.body} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Eye className="w-4 h-4" />
            <span className="text-xs font-medium">{post.view_count || 0}</span>
          </div>
          <PostViewers postId={post.id} viewCount={post.view_count || 0} />
        </div>
      </div>

      {/* Comments */}
      <AnimatePresence>
        {showComments && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t overflow-hidden">
            <div className="p-3 max-h-64 overflow-y-auto">
              <CommentSection postId={post.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Main Feed ──
const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<{ [key: string]: UserProfile }>({});
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [postLikes, setPostLikes] = useState<{ [key: string]: PostLike[] }>({});
  const [loading, setLoading] = useState(true);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showOldPosts, setShowOldPosts] = useState(false);
  const [stories, setStories] = useState<any[]>([]);
  const [selectedStoryUserId, setSelectedStoryUserId] = useState<string | null>(null);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [processedPosts, setProcessedPosts] = useState<Set<string>>(new Set());
  const processingPostsRef = useRef<Set<string>>(new Set());
  const [userStarBalance, setUserStarBalance] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const postCardsRef = useRef<HTMLDivElement[]>([]);
  const currentPostIndexRef = useRef(0);

  // Anti-bot tracking
  const scrollTimestamps = useRef<number[]>([]);
  const [showBotCheck, setShowBotCheck] = useState(false);
  const lastScrollY = useRef(0);

  // Anti-bot scroll detection
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const handleScroll = () => {
      const now = Date.now();
      const diff = Math.abs(el.scrollTop - lastScrollY.current);
      lastScrollY.current = el.scrollTop;
      if (diff > 800) {
        scrollTimestamps.current.push(now);
        scrollTimestamps.current = scrollTimestamps.current.filter(t => now - t < 2000);
        if (scrollTimestamps.current.length > 3) setShowBotCheck(true);
      }
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll: scroll to next post card
  const scrollToNextPost = useCallback(() => {
    if (!autoScroll || !feedRef.current) return;
    const postElements = feedRef.current.querySelectorAll('[data-post-card]');
    if (postElements.length === 0) return;
    currentPostIndexRef.current = Math.min(currentPostIndexRef.current + 1, postElements.length - 1);
    postElements[currentPostIndexRef.current]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(15);
  }, [autoScroll]);

  // ── Data loading ──
  useEffect(() => {
    if (user) {
      checkUserProfile();
      loadUserBalances();
      loadFollowing();
      loadProducts();
    }
  }, [user]);

  useEffect(() => {
    if (userProfile) {
      fetchPosts();
      loadUserStories();
      loadCurrentUserProfile();
      const cleanup = setupRealtimeSubscription();
      return cleanup;
    }
  }, [userProfile, showOldPosts]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('wallet-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${user.id}` }, (payload) => {
        const d = payload.new as any;
        setUserStarBalance(d.star_balance || 0);
        setWalletBalance(d.wallet_balance || 0);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*, user_profiles:seller_user_id(username, avatar_url, vip)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10);
    setProducts(data || []);
  };

  const loadFollowing = async () => {
    if (!user) return;
    const { data } = await supabase.from('followers').select('following_id').eq('follower_id', user.id);
    setFollowingUsers(new Set(data?.map(f => f.following_id) || []));
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

  const loadUserBalances = async () => {
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('star_balance, wallet_balance').eq('id', user.id).single();
    setUserStarBalance(data?.star_balance || 0);
    setWalletBalance(data?.wallet_balance || 0);
  };

  const loadCurrentUserProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('username, avatar_url').eq('id', user.id).single();
    setCurrentUserProfile(data);
  };

  const loadUserStories = async () => {
    const { data } = await supabase
      .from('user_storylines')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (data) {
      const userStoryMap = new Map();
      data.forEach(story => {
        if (!userStoryMap.has(story.user_id)) userStoryMap.set(story.user_id, story);
      });
      const userIds = Array.from(userStoryMap.keys());
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('user_profiles').select('id, username, avatar_url').in('id', userIds);
        const profileMap = new Map(profiles?.map(p => [p.id, p]));
        setStories(Array.from(userStoryMap.values()).map(story => ({
          ...story,
          user_profile: profileMap.get(story.user_id)
        })));
      } else {
        setStories([]);
      }
    }
  };

  const checkUserProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
    if (error && error.code === 'PGRST116') {
      setNeedsProfileSetup(true);
      setLoading(false);
      return;
    }
    if (error) { setLoading(false); return; }
    setUserProfile(data);
    setNeedsProfileSetup(false);
    // Check onboarding
    const storySettings = data?.story_settings as any;
    if (!storySettings?.onboarding_complete) {
      setNeedsOnboarding(true);
    }
  };

  const fetchPosts = async () => {
    try {
      let query = supabase.from('posts').select('*').eq('status', 'approved').eq('disabled', false);
      if (showOldPosts) query = query.eq('post_status', 'viewed');
      else query = query.eq('post_status', 'new');

      const { data: postsData } = await query
        .order('boosted', { ascending: false })
        .order('rating', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      let filteredPosts = postsData || [];
      if (user) {
        const { data: hiddenPosts } = await supabase.from('hidden_posts').select('post_id').eq('user_id', user.id);
        const hiddenPostIds = new Set(hiddenPosts?.map(h => h.post_id) || []);
        filteredPosts = filteredPosts.filter(post => !hiddenPostIds.has(post.id));
      }

      if (filteredPosts.length > 0) {
        const userIds = [...new Set(filteredPosts.map(post => post.user_id))];
        const { data: usersData } = await supabase.from('user_profiles').select('id, username, avatar_url, vip').in('id', userIds);
        const usersLookup: { [key: string]: UserProfile } = {};
        usersData?.forEach(u => { usersLookup[u.id] = u; });

        const { data: likesData } = await supabase.from('post_likes').select('*').in('post_id', filteredPosts.map(p => p.id));
        const likesLookup: { [key: string]: PostLike[] } = {};
        likesData?.forEach(like => {
          if (!likesLookup[like.post_id]) likesLookup[like.post_id] = [];
          likesLookup[like.post_id].push(like);
        });

        const counts = await Promise.all(
          filteredPosts.map(async (p) => {
            const { count } = await (supabase as any).from('post_comments').select('*', { count: 'exact', head: true }).eq('post_id', p.id);
            return { id: p.id, count: count || 0 };
          })
        );
        const countMap = new Map(counts.map(c => [c.id, c.count]));

        setPosts(filteredPosts.map(p => ({ ...p, comments_count: countMap.get(p.id) || p.comments_count || 0 })));
        setUsers(usersLookup);
        setPostLikes(likesLookup);
      } else {
        setPosts([]);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('posts-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: 'status=eq.approved' }, () => fetchPosts())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_likes' }, (payload) => {
        setPostLikes(prev => {
          const updated = { ...prev };
          const postId = payload.new.post_id;
          if (!updated[postId]) updated[postId] = [];
          updated[postId].push(payload.new as PostLike);
          return updated;
        });
        setPosts(prev => prev.map(post =>
          post.id === payload.new.post_id ? { ...post, likes_count: (post.likes_count || 0) + 1 } : post
        ));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'post_likes' }, (payload) => {
        setPostLikes(prev => {
          const updated = { ...prev };
          const postId = payload.old.post_id;
          if (updated[postId]) updated[postId] = updated[postId].filter(l => l.id !== payload.old.id);
          return updated;
        });
        setPosts(prev => prev.map(post =>
          post.id === payload.old.post_id ? { ...post, likes_count: Math.max(0, (post.likes_count || 0) - 1) } : post
        ));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_views' }, (payload) => {
        setPosts(prev => prev.map(post =>
          post.id === payload.new.post_id ? { ...post, view_count: (post.view_count || 0) + 1 } : post
        ));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  };

  const handleLike = async (postId: string) => {
    if (!user) return;
    const existing = (postLikes[postId] || []).find(l => l.user_id === user.id);
    if (existing) {
      await supabase.from('post_likes').delete().eq('id', existing.id);
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
    }
  };

  const processPostPayment = useCallback(async (post: Post) => {
    if (!user || processedPosts.has(post.id) || processingPostsRef.current.has(post.id)) return;
    processingPostsRef.current.add(post.id);
    try {
      await ensureUserProfile(supabase as any, { id: user.id, email: user.email });
      const { data, error } = await supabase.rpc('process_post_view', { p_post_id: post.id, p_viewer_id: user.id });
      if (error) { console.error('RPC Error:', error); return; }
      const result = data as any;
      if (result?.success) {
        setProcessedPosts(prev => new Set(prev).add(post.id));
        await loadUserBalances();
        if (result.charged) {
          toast({
            title: '💰 You Earned!',
            description: `⭐ ${result.stars_spent} Stars → ₦${result.viewer_earn} cashback!`,
          });
        } else if (!result.already_viewed && result.free) {
          toast({ title: '👁️ View recorded' });
        }
      }
    } finally {
      processingPostsRef.current.delete(post.id);
    }
  }, [user, processedPosts]);

  // Skip to next post (for star gate cancel or auto-scroll)
  const skipToNextPost = useCallback(() => {
    scrollToNextPost();
  }, [scrollToNextPost]);

  if (needsProfileSetup) {
    return <ProfileSetup onComplete={() => { setNeedsProfileSetup(false); checkUserProfile(); }} />;
  }

  if (needsOnboarding) {
    return <OnboardingFlow onComplete={() => setNeedsOnboarding(false)} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading feed...</p>
        </div>
      </div>
    );
  }

  // Build mixed feed items
  const feedItems: { type: 'post' | 'product' | 'suggested'; data: any; key: string }[] = [];
  let productIndex = 0;
  let suggestedInserted = false;

  posts.forEach((post, i) => {
    feedItems.push({ type: 'post', data: post, key: `post-${post.id}` });
    if ((i + 1) % 3 === 0 && productIndex < products.length) {
      feedItems.push({ type: 'product', data: products[productIndex], key: `product-${products[productIndex].id}` });
      productIndex++;
    }
    if (i === 1 && !suggestedInserted) {
      feedItems.push({ type: 'suggested', data: null, key: 'suggested-users' });
      suggestedInserted = true;
    }
  });

  return (
    <div className="relative min-h-screen bg-background">
      {/* Fixed header: Lenory brand + stars + auto-scroll + tabs */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
          <h1 className="text-xl font-black bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Lenory
          </h1>
          <div className="flex items-center gap-2">
            <Badge className="bg-yellow-500/90 text-black text-[10px] gap-0.5 font-bold">
              <Star className="w-3 h-3 fill-current" />{userStarBalance}
            </Badge>
            <Badge variant="secondary" className="text-[10px] font-bold">₦{walletBalance.toLocaleString()}</Badge>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1.5 rounded-full transition-all ${autoScroll ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30' : 'bg-muted text-muted-foreground'}`}
              title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
            >
              {autoScroll ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Feed tabs - always visible under header */}
        <div className="flex gap-1.5 px-4 pb-2 pt-1">
          <Button
            variant={!showOldPosts ? 'default' : 'outline'}
            size="sm"
            className="flex-1 h-8 text-xs font-semibold"
            onClick={() => setShowOldPosts(false)}
          >
            <TrendingUp className="w-3 h-3 mr-1" /> New
          </Button>
          <Button
            variant={showOldPosts ? 'default' : 'outline'}
            size="sm"
            className="flex-1 h-8 text-xs font-semibold"
            onClick={() => setShowOldPosts(true)}
          >
            Past Posts
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs px-3 gap-1 bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold"
            onClick={() => setIsCreatePostOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Post
          </Button>
        </div>
      </div>

      {/* Scrollable content: search, stories, then posts */}
      <div ref={feedRef} className="px-3 py-3 space-y-3 pb-20 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 7.5rem)' }}>
        {/* Search bar - scrolls with content */}
        <div className="px-1">
          <NewSearchBar />
        </div>

        {/* Stories strip - scrolls with content */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex items-start gap-2.5 min-w-min">
            <StorylineCard
              type="create"
              avatarUrl={currentUserProfile?.avatar_url}
              onSelect={() => setShowCreateStory(true)}
            />
            {stories.map((story: any) => (
              <StorylineCard
                key={story.id}
                type="story"
                previewUrl={story.preview_url || story.media_url}
                avatarUrl={story.user_profile?.avatar_url}
                username={story.user_profile?.username}
                starPrice={story.star_price}
                onSelect={() => {
                  setSelectedStoryUserId(story.user_id);
                  setShowStoryViewer(true);
                }}
              />
            ))}
          </div>
        </div>

        {/* Feed items */}
        {feedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="text-5xl">🚀</div>
            <h3 className="text-lg font-bold">No posts yet</h3>
            <p className="text-muted-foreground text-sm text-center">Be the first to share something!</p>
            <Button onClick={() => setIsCreatePostOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Create Post
            </Button>
          </div>
        ) : (
          feedItems.map((item) => {
            if (item.type === 'suggested') {
              return <SuggestedUsers key={item.key} />;
            }
            if (item.type === 'product') {
              return <ProductCard key={item.key} product={item.data} />;
            }
            const post = item.data as Post;
            return (
              <div key={item.key} data-post-card>
                <FeedPostCard
                  post={post}
                  postUser={users[post.user_id]}
                  isLiked={(postLikes[post.id] || []).some(l => l.user_id === user?.id)}
                  likesCount={postLikes[post.id]?.length || 0}
                  commentsCount={post.comments_count || 0}
                  isProcessed={processedPosts.has(post.id)}
                  isFollowing={followingUsers.has(post.user_id)}
                  isOwnPost={post.user_id === user?.id}
                  userId={user?.id}
                  userStarBalance={userStarBalance}
                  onLike={() => handleLike(post.id)}
                  onFollow={() => handleFollow(post.user_id)}
                  onProfile={() => navigate(`/profile/${post.user_id}`)}
                  onProcessView={() => processPostPayment(post)}
                  onFetchPosts={fetchPosts}
                  onStarGateSkip={skipToNextPost}
                  onAutoScrollComplete={autoScroll ? scrollToNextPost : undefined}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Anti-bot check */}
      <AnimatePresence>
        {showBotCheck && (
          <motion.div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="bg-card rounded-2xl p-6 mx-6 max-w-sm w-full shadow-2xl" initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
              <div className="text-center space-y-4">
                <div className="text-4xl">🧠</div>
                <h3 className="text-lg font-bold">Brain Box Check</h3>
                <p className="text-sm text-muted-foreground">Are you learning or just scrolling?</p>
                <Button className="w-full" onClick={() => { setShowBotCheck(false); scrollTimestamps.current = []; }}>
                  I'm Learning! 📚
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auto-scroll indicator */}
      {autoScroll && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
          <Badge className="bg-primary/90 text-primary-foreground animate-pulse gap-1 shadow-lg">
            <ChevronUp className="w-3 h-3" /> Auto-scrolling
          </Badge>
        </div>
      )}

      {/* Create Post Wizard */}
      <CreatePostWizard onPostCreated={fetchPosts} isOpen={isCreatePostOpen} onOpenChange={setIsCreatePostOpen} />

      {/* Story Viewer */}
      {showStoryViewer && selectedStoryUserId && (
        <EnhancedStorylineViewer
          userId={selectedStoryUserId}
          open={showStoryViewer}
          onClose={() => { setShowStoryViewer(false); setSelectedStoryUserId(null); }}
        />
      )}

      {/* Create Story */}
      {showCreateStory && (
        <Dialog open={showCreateStory} onOpenChange={setShowCreateStory}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <CreateStoryline onCreated={() => { setShowCreateStory(false); loadUserStories(); }} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Feed;
