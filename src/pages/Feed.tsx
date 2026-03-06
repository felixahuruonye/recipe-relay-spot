import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageCircle, Star, Eye, Share2, Volume2, VolumeX, ChevronUp, ChevronDown, Zap, Timer, Lock, UserPlus, Music, ToggleLeft, ToggleRight } from 'lucide-react';
import { EnhancedStorylineViewer } from '@/components/Storyline/EnhancedStorylineViewer';
import { CreateStoryline } from '@/components/Storyline/CreateStoryline';
import { StorylineCard } from '@/components/Storyline/StorylineCard';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CreatePost from '@/components/Posts/CreatePost';
import ProfileSetup from '@/components/Profile/ProfileSetup';
import NewSearchBar from '@/components/Search/NewSearchBar';
import { CommentSection } from '@/components/Feed/CommentSection';
import { VideoPlayer } from '@/components/Feed/VideoPlayer';
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

// ── Snap-Focus Post Card ──
const SnapFocusPost: React.FC<{
  post: Post;
  postUser?: UserProfile;
  isActive: boolean;
  isLiked: boolean;
  likesCount: number;
  commentsCount: number;
  isProcessed: boolean;
  isFollowing: boolean;
  isOwnPost: boolean;
  userStarBalance: number;
  onLike: () => void;
  onFollow: () => void;
  onProfile: () => void;
  onComment: () => void;
  onProcessView: () => void;
  onFetchPosts: () => void;
}> = ({ post, postUser, isActive, isLiked, likesCount, commentsCount, isProcessed, isFollowing, isOwnPost, userStarBalance, onLike, onFollow, onProfile, onComment, onProcessView, onFetchPosts }) => {
  const [showComments, setShowComments] = useState(false);
  const [viewProgress, setViewProgress] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const hasProcessedRef = useRef(false);

  const hasMedia = post.media_urls && post.media_urls.length > 0;
  const isVideo = hasMedia && (post.media_urls[0].match(/\.(mp4|webm|ogg)$/i) || post.media_urls[0].includes('video'));
  const isPaidPost = post.star_price && post.star_price > 0 && post.user_id !== postUser?.id;
  const viewDuration = isVideo ? 0 : 30; // seconds for images; videos use ended event

  // 3-second focus reveal + view progress timer
  useEffect(() => {
    if (!isActive) {
      if (timerRef.current) clearInterval(timerRef.current);
      setViewProgress(0);
      setRevealed(false);
      startTimeRef.current = 0;
      return;
    }

    // Start the focus timer
    startTimeRef.current = Date.now();
    
    // Haptic feedback on snap
    if (navigator.vibrate) navigator.vibrate(15);

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      
      // Reveal after 3 seconds
      if (elapsed >= 3 && !revealed) {
        setRevealed(true);
      }

      if (isVideo) {
        // For videos, progress is based on video playback (handled by videoEnded)
        setViewProgress(Math.min(elapsed / 30 * 100, 99)); // visual only
      } else {
        // For images, progress fills over viewDuration
        const progress = Math.min((elapsed / viewDuration) * 100, 100);
        setViewProgress(progress);
        
        if (progress >= 100 && !hasProcessedRef.current && !isProcessed) {
          hasProcessedRef.current = true;
          onProcessView();
        }
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  // Handle video end
  useEffect(() => {
    if (videoEnded && isActive && !hasProcessedRef.current && !isProcessed) {
      hasProcessedRef.current = true;
      setViewProgress(100);
      onProcessView();
    }
  }, [videoEnded, isActive]);

  // Reset on post change
  useEffect(() => {
    hasProcessedRef.current = isProcessed;
  }, [post.id]);

  return (
    <motion.div
      className="snap-start snap-always relative w-full flex flex-col"
      style={{ height: 'calc(100vh - 4rem)', minHeight: 'calc(100dvh - 4rem)' }}
      initial={{ opacity: 0.7, scale: 0.98 }}
      animate={{
        opacity: isActive ? 1 : 0.5,
        scale: isActive ? 1 : 0.95,
      }}
      transition={{ duration: 0.3 }}
    >
      {/* Background glow when active */}
      <div className={`absolute inset-0 transition-all duration-700 rounded-xl ${
        isActive 
          ? 'bg-gradient-to-b from-primary/5 via-transparent to-primary/10 shadow-[0_0_60px_-15px_hsl(var(--primary)/0.3)]' 
          : 'bg-background/50'
      }`} />

      {/* Main content area */}
      <div className="relative flex-1 flex flex-col overflow-hidden rounded-xl">
        {/* Media area - takes most space */}
        <div className="relative flex-1 bg-black/5 dark:bg-white/5 overflow-hidden rounded-t-xl">
          {hasMedia ? (
            <>
              {isVideo ? (
                <div className="w-full h-full">
                  <video
                    src={post.media_urls[0]}
                    className="w-full h-full object-cover"
                    autoPlay={isActive}
                    loop={false}
                    muted={!isActive}
                    playsInline
                    onEnded={() => setVideoEnded(true)}
                    onPause={() => {
                      if (!isActive) return;
                    }}
                  />
                </div>
              ) : (
                <img
                  src={post.media_urls[0]}
                  alt={post.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}

              {/* Blur overlay before reveal */}
              <motion.div
                className="absolute inset-0 bg-black/20 backdrop-blur-sm"
                animate={{ opacity: revealed ? 0 : 1 }}
                transition={{ duration: 0.5 }}
                style={{ pointerEvents: 'none' }}
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-6 bg-gradient-to-br from-primary/10 to-accent/10">
              <p className="text-lg text-center font-medium leading-relaxed">{post.body}</p>
            </div>
          )}

          {/* Star price badge */}
          {isPaidPost && (
            <Badge className="absolute top-3 left-3 bg-yellow-500/90 text-black gap-1 z-10">
              <Star className="w-3 h-3 fill-current" />
              {post.star_price} Stars
            </Badge>
          )}

          {/* View timer badge */}
          {!isProcessed && isActive && !isVideo && viewProgress < 100 && (
            <Badge className="absolute top-3 right-3 bg-primary/80 text-primary-foreground animate-pulse z-10 gap-1">
              <Timer className="w-3 h-3" />
              {Math.ceil(viewDuration - (viewDuration * viewProgress / 100))}s
            </Badge>
          )}

          {isProcessed && (
            <Badge className="absolute top-3 right-3 bg-green-500/90 text-white z-10 gap-1">
              <Zap className="w-3 h-3" /> Earned
            </Badge>
          )}

          {/* Right side action buttons (TikTok style) */}
          <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5 z-20">
            {/* Profile */}
            <button onClick={onProfile} className="relative">
              <Avatar className="w-11 h-11 border-2 border-white shadow-lg">
                <AvatarImage src={postUser?.avatar_url} />
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {postUser?.username?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              {!isOwnPost && !isFollowing && (
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-primary rounded-full w-5 h-5 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">+</span>
                </div>
              )}
            </button>

            {/* Like */}
            <button onClick={onLike} className="flex flex-col items-center gap-0.5">
              <motion.div
                whileTap={{ scale: 1.4 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <Heart className={`w-7 h-7 drop-shadow-lg ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
              </motion.div>
              <span className="text-white text-xs font-bold drop-shadow">{likesCount}</span>
            </button>

            {/* Comment */}
            <button onClick={() => setShowComments(!showComments)} className="flex flex-col items-center gap-0.5">
              <MessageCircle className="w-7 h-7 text-white drop-shadow-lg" />
              <span className="text-white text-xs font-bold drop-shadow">{commentsCount}</span>
            </button>

            {/* Views */}
            <div className="flex flex-col items-center gap-0.5">
              <Eye className="w-6 h-6 text-white/80 drop-shadow-lg" />
              <span className="text-white text-xs font-bold drop-shadow">{post.view_count || 0}</span>
            </div>

            {/* Share */}
            <ShareMenu
              postId={post.id}
              postTitle={post.title}
              postImage={hasMedia ? post.media_urls[0] : undefined}
              postDescription={post.body}
            />
          </div>

          {/* Bottom overlay with title and user info */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
            animate={{ opacity: revealed ? 1 : 0.5 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <button onClick={onProfile} className="flex items-center gap-2">
                <span className="text-white font-bold text-sm drop-shadow">@{postUser?.username}</span>
                {postUser?.vip && (
                  <Badge className="bg-yellow-400 text-black text-[10px] px-1 py-0">VIP</Badge>
                )}
              </button>
              {!isOwnPost && (
                <Button
                  size="sm"
                  variant={isFollowing ? 'secondary' : 'default'}
                  className="h-6 text-[10px] px-2"
                  onClick={onFollow}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </Button>
              )}
            </div>
            <h3 className="text-white font-semibold text-base drop-shadow mb-1 line-clamp-2">{post.title}</h3>
            {hasMedia && post.body && (
              <p className="text-white/80 text-xs line-clamp-2 drop-shadow">{post.body}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-white/70 border-white/30 text-[10px]">{post.category}</Badge>
              {post.boosted && <Badge className="bg-accent text-accent-foreground text-[10px]">🔥 Boosted</Badge>}
            </div>
          </motion.div>
        </div>

        {/* View progress bar */}
        <div className="h-1 bg-muted relative overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-accent"
            animate={{ width: `${viewProgress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      </div>

      {/* Comments bottom sheet */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 h-[60%] bg-card rounded-t-2xl z-30 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-center py-2">
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
            </div>
            <div className="px-4 pb-2 border-b">
              <h4 className="font-semibold text-sm">Comments ({commentsCount})</h4>
            </div>
            <div className="overflow-y-auto h-[calc(100%-3rem)] p-4">
              <CommentSection postId={post.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<{ [key: string]: UserProfile }>({});
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [postLikes, setPostLikes] = useState<{ [key: string]: PostLike[] }>({});
  const [loading, setLoading] = useState(true);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
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
  const [activePostIndex, setActivePostIndex] = useState(0);
  const [autoScroll, setAutoScroll] = useState(false);
  const [showHeader, setShowHeader] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const autoScrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Anti-bot tracking
  const scrollTimestamps = useRef<number[]>([]);
  const [showBotCheck, setShowBotCheck] = useState(false);

  // Intersection observer for snap detection
  const observerRef = useRef<IntersectionObserver | null>(null);
  const postRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
            const index = Number(entry.target.getAttribute('data-index'));
            if (!isNaN(index)) {
              // Anti-bot check
              const now = Date.now();
              scrollTimestamps.current.push(now);
              scrollTimestamps.current = scrollTimestamps.current.filter(t => now - t < 2000);
              if (scrollTimestamps.current.length > 3) {
                setShowBotCheck(true);
                return;
              }
              setActivePostIndex(index);
            }
          }
        });
      },
      { threshold: 0.7 }
    );

    return () => observerRef.current?.disconnect();
  }, []);

  // Auto-scroll logic
  useEffect(() => {
    if (!autoScroll || posts.length === 0) {
      if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
      return;
    }

    const post = posts[activePostIndex];
    const hasMedia = post?.media_urls?.length > 0;
    const isVideo = hasMedia && (post.media_urls[0].match(/\.(mp4|webm|ogg)$/i) || post.media_urls[0].includes('video'));
    const duration = isVideo ? 35000 : 33000; // auto advance after view complete

    autoScrollTimerRef.current = setTimeout(() => {
      if (activePostIndex < posts.length - 1) {
        const nextEl = postRefs.current.get(activePostIndex + 1);
        nextEl?.scrollIntoView({ behavior: 'smooth' });
      }
    }, duration);

    return () => {
      if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
    };
  }, [autoScroll, activePostIndex, posts]);

  // Register post refs with observer
  const setPostRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      postRefs.current.set(index, el);
      observerRef.current?.observe(el);
    }
  }, []);

  // Hide header on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (feedRef.current) {
        setShowHeader(feedRef.current.scrollTop < 100);
      }
    };
    feedRef.current?.addEventListener('scroll', handleScroll);
    return () => feedRef.current?.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Data loading ──
  useEffect(() => {
    if (user) {
      checkUserProfile();
      loadUserBalances();
      loadFollowing();
    }
  }, [user]);

  useEffect(() => {
    if (userProfile) {
      fetchPosts();
      loadUserStories();
      loadCurrentUserProfile();
      setupRealtimeSubscription();
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
      const { data: profiles } = await supabase.from('user_profiles').select('id, username, avatar_url').in('id', userIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]));
      setStories(Array.from(userStoryMap.values()).map(story => ({
        ...story,
        user_profile: profileMap.get(story.user_id)
      })));
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

        // Load comment counts
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
          post.id === payload.new.post_id ? { ...post, likes_count: post.likes_count + 1 } : post
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
          post.id === payload.old.post_id ? { ...post, likes_count: Math.max(0, post.likes_count - 1) } : post
        ));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_views' }, () => {
        // Refresh view counts
        fetchPosts();
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
          toast({ title: '💰 Earned!', description: `⭐ ${result.stars_spent} Stars → ₦${result.viewer_earn} cashback!` });
        } else if (result.already_viewed) {
          // silent
        } else {
          toast({ title: '👁️ Viewed', description: 'Free post viewed' });
        }
      }
    } finally {
      processingPostsRef.current.delete(post.id);
    }
  }, [user, processedPosts]);

  if (needsProfileSetup) {
    return <ProfileSetup onComplete={() => { setNeedsProfileSetup(false); checkUserProfile(); }} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 4rem)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm animate-pulse">Loading your feed...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: 'calc(100vh - 4rem)' }}>
      {/* Floating header */}
      <motion.div
        className="absolute top-0 left-0 right-0 z-40 px-4 pt-2 pb-1 bg-gradient-to-b from-background to-transparent"
        animate={{ y: showHeader ? 0 : -100, opacity: showHeader ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold text-primary">Lernory</h1>
          <div className="flex items-center gap-2">
            <Badge className="bg-yellow-500/90 text-black text-[10px] gap-0.5">
              <Star className="w-3 h-3 fill-current" />{userStarBalance}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">₦{walletBalance.toLocaleString()}</Badge>
            
            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1.5 rounded-full transition-colors ${autoScroll ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            >
              {autoScroll ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Stories strip */}
        <div className="overflow-x-auto -mx-4 px-4 pb-1">
          <div className="flex items-start gap-2.5">
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

        {/* View toggle + create */}
        <div className="flex gap-1.5 mt-1">
          <Button
            variant={!showOldPosts ? 'default' : 'outline'}
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => setShowOldPosts(false)}
          >New</Button>
          <Button
            variant={showOldPosts ? 'default' : 'outline'}
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => setShowOldPosts(true)}
          >Past</Button>
          <Button
            size="sm"
            className="h-7 text-xs px-3 bg-accent text-accent-foreground"
            onClick={() => setIsCreatePostOpen(true)}
          >
            <Zap className="w-3 h-3 mr-1" /> Post
          </Button>
        </div>
      </motion.div>

      {/* Snap-Focus Feed */}
      <div
        ref={feedRef}
        className="h-full overflow-y-auto"
        style={{
          scrollSnapType: 'y mandatory',
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Spacer for header */}
        <div className="h-36 snap-start" />

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 p-8" style={{ height: 'calc(100vh - 14rem)' }}>
            <div className="text-5xl">🚀</div>
            <h3 className="text-lg font-bold">No posts yet</h3>
            <p className="text-muted-foreground text-sm text-center">Be the first to share something amazing!</p>
            <Button onClick={() => setIsCreatePostOpen(true)} className="gap-2">
              <Zap className="w-4 h-4" /> Create Post
            </Button>
          </div>
        ) : (
          posts.map((post, index) => (
            <div
              key={post.id}
              ref={(el) => setPostRef(index, el)}
              data-index={index}
              className="snap-start snap-always"
            >
              <SnapFocusPost
                post={post}
                postUser={users[post.user_id]}
                isActive={activePostIndex === index}
                isLiked={(postLikes[post.id] || []).some(l => l.user_id === user?.id)}
                likesCount={postLikes[post.id]?.length || 0}
                commentsCount={post.comments_count || 0}
                isProcessed={processedPosts.has(post.id)}
                isFollowing={followingUsers.has(post.user_id)}
                isOwnPost={post.user_id === user?.id}
                userStarBalance={userStarBalance}
                onLike={() => handleLike(post.id)}
                onFollow={() => handleFollow(post.user_id)}
                onProfile={() => navigate(`/profile/${post.user_id}`)}
                onComment={() => {}}
                onProcessView={() => processPostPayment(post)}
                onFetchPosts={fetchPosts}
              />
            </div>
          ))
        )}
      </div>

      {/* Anti-bot check dialog */}
      <AnimatePresence>
        {showBotCheck && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-card rounded-2xl p-6 mx-6 max-w-sm w-full shadow-2xl"
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
            >
              <div className="text-center space-y-4">
                <div className="text-4xl">🧠</div>
                <h3 className="text-lg font-bold">Brain Box Check</h3>
                <p className="text-sm text-muted-foreground">Are you learning or just scrolling?</p>
                <p className="text-xs text-muted-foreground">Slow down to earn more from each post!</p>
                <Button
                  className="w-full"
                  onClick={() => {
                    setShowBotCheck(false);
                    scrollTimestamps.current = [];
                  }}
                >
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
          <Badge className="bg-primary/90 text-primary-foreground animate-pulse gap-1">
            <ChevronUp className="w-3 h-3" /> Auto-scrolling
          </Badge>
        </div>
      )}

      {/* Create Post Dialog */}
      <CreatePost
        onPostCreated={fetchPosts}
        isOpen={isCreatePostOpen}
        onOpenChange={setIsCreatePostOpen}
      />

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
            <CreateStoryline onComplete={() => { setShowCreateStory(false); loadUserStories(); }} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Feed;
