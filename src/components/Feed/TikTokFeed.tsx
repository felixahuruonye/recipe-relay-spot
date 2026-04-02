import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Heart, MessageCircle, Share2, Star, Volume2, VolumeX,
  Plus, Music2, Eye, UserPlus, Bookmark, MoreHorizontal,
  Home, Search, ShoppingBag, User, Menu
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { LoginModal } from './LoginModal';
import { CommentSection } from './CommentSection';
import { ShareMenu } from './ShareMenu';
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
}

interface UserProfile {
  id: string;
  username: string;
  avatar_url: string;
  vip: boolean;
}

// ── Single full-screen post ──
const TikTokPost: React.FC<{
  post: Post;
  postUser?: UserProfile;
  musicTrack?: MusicTrack;
  isActive: boolean;
  isLiked: boolean;
  likesCount: number;
  commentsCount: number;
  isFollowing: boolean;
  isOwnPost: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onLike: () => void;
  onFollow: () => void;
  onComment: () => void;
  onShare: () => void;
  onProfile: () => void;
  onRequireLogin: (msg?: string) => void;
  isLoggedIn: boolean;
}> = ({
  post, postUser, isActive, isLiked, likesCount, commentsCount,
  isFollowing, isOwnPost, isMuted, onToggleMute, onLike, onFollow,
  onComment, onShare, onProfile, onRequireLogin, isLoggedIn
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasMedia = post.media_urls && post.media_urls.length > 0;
  const isVideo = hasMedia && (post.media_urls[0]?.match(/\.(mp4|webm|ogg|mov)$/i) || post.media_urls[0]?.includes('video'));

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

  const handleAction = (action: () => void, msg?: string) => {
    if (!isLoggedIn) {
      onRequireLogin(msg);
      return;
    }
    action();
  };

  const formatCount = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  return (
    <div className="relative w-full h-[100dvh] snap-start snap-always bg-black flex items-center justify-center overflow-hidden">
      {/* Background - blurred version for images */}
      {hasMedia && !isVideo && (
        <div
          className="absolute inset-0 bg-cover bg-center blur-2xl scale-110 opacity-30"
          style={{ backgroundImage: `url(${post.media_urls[0]})` }}
        />
      )}

      {/* Main media */}
      {hasMedia && isVideo ? (
        <video
          ref={videoRef}
          src={post.media_urls[0]}
          className="absolute inset-0 w-full h-full object-cover"
          loop
          playsInline
          muted={isMuted}
          onClick={() => {
            if (videoRef.current?.paused) videoRef.current.play().catch(() => {});
            else videoRef.current?.pause();
          }}
        />
      ) : hasMedia ? (
        <img
          src={post.media_urls[0]}
          alt={post.title}
          className="relative z-10 max-w-full max-h-full object-contain"
          loading="lazy"
        />
      ) : (
        // Text-only post with gradient background
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-accent/60 to-primary/40 flex items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-lg">
            <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">{post.title}</h2>
            <p className="text-white/80 text-base md:text-lg leading-relaxed">{post.body}</p>
          </div>
        </div>
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 pointer-events-none z-20" />

      {/* Mute button (video only) */}
      {isVideo && (
        <button
          onClick={onToggleMute}
          className="absolute top-16 right-4 z-30 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
        </button>
      )}

      {/* Right side action buttons */}
      <div className="absolute right-3 bottom-32 z-30 flex flex-col items-center gap-5">
        {/* Profile avatar */}
        <div className="relative mb-2">
          <button onClick={onProfile} className="block">
            <Avatar className="w-11 h-11 ring-2 ring-white/80">
              <AvatarImage src={postUser?.avatar_url} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                {postUser?.username?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </button>
          {!isOwnPost && !isFollowing && (
            <button
              onClick={() => handleAction(onFollow, 'Login to follow users')}
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
            >
              <Plus className="w-3 h-3 text-primary-foreground" />
            </button>
          )}
        </div>

        {/* Like */}
        <button onClick={() => handleAction(onLike, 'Login to like posts')} className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <Heart className={`w-6 h-6 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
          </div>
          <span className="text-white text-xs font-semibold">{formatCount(likesCount)}</span>
        </button>

        {/* Comment */}
        <button onClick={() => handleAction(onComment, 'Login to comment')} className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-semibold">{formatCount(commentsCount)}</span>
        </button>

        {/* Share */}
        <button onClick={onShare} className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-semibold">Share</span>
        </button>

        {/* Views */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <Eye className="w-5 h-5 text-white/70" />
          </div>
          <span className="text-white/70 text-xs">{formatCount(post.view_count || 0)}</span>
        </div>
      </div>

      {/* Bottom info overlay */}
      <div className="absolute bottom-20 left-4 right-20 z-30">
        <div className="space-y-2">
          <button onClick={onProfile} className="flex items-center gap-2">
            <span className="text-white font-bold text-sm">@{postUser?.username || 'user'}</span>
            {postUser?.vip && (
              <Badge className="bg-yellow-400 text-black text-[9px] px-1 py-0 h-4">VIP</Badge>
            )}
          </button>
          <p className="text-white text-sm leading-relaxed line-clamp-3">
            {post.title}
            {post.body && hasMedia && (
              <span className="text-white/70"> {post.body}</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] h-5 px-2 border-white/30 text-white/80">
              {post.category}
            </Badge>
            {post.star_price && post.star_price > 0 && (
              <Badge className="bg-yellow-500/90 text-black text-[10px] gap-0.5">
                <Star className="w-3 h-3 fill-current" /> {post.star_price}
              </Badge>
            )}
          </div>
          {/* Music indicator */}
          <div className="flex items-center gap-2 mt-1">
            <Music2 className="w-3.5 h-3.5 text-white/60" />
            <span className="text-white/60 text-xs truncate max-w-[200px]">Original sound - {postUser?.username}</span>
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
  const [users, setUsers] = useState<Record<string, UserProfile>>({});
  const [postLikes, setPostLikes] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [activeSharePost, setActiveSharePost] = useState<Post | null>(null);
  const [processedPosts, setProcessedPosts] = useState<Set<string>>(new Set());
  const processingRef = useRef<Set<string>>(new Set());
  const feedRef = useRef<HTMLDivElement>(null);

  // Fetch posts (public - no auth required)
  useEffect(() => {
    fetchPosts();
  }, []);

  // Load user-specific data when logged in
  useEffect(() => {
    if (user) {
      loadFollowing();
    }
  }, [user]);

  // Track active post via scroll
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

  // Process view when active post changes
  useEffect(() => {
    if (!user || posts.length === 0) return;
    const post = posts[activeIndex];
    if (!post || processedPosts.has(post.id) || processingRef.current.has(post.id)) return;

    const timer = setTimeout(() => {
      processView(post);
    }, 3000); // 3s viewing time

    return () => clearTimeout(timer);
  }, [activeIndex, user, posts]);

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
          .select('id, username, avatar_url, vip')
          .in('id', userIds);

        const usersMap: Record<string, UserProfile> = {};
        usersData?.forEach(u => { usersMap[u.id] = u; });

        const { data: likesData } = await supabase
          .from('post_likes')
          .select('*')
          .in('post_id', allPosts.map(p => p.id));

        const likesMap: Record<string, any[]> = {};
        likesData?.forEach(l => {
          if (!likesMap[l.post_id]) likesMap[l.post_id] = [];
          likesMap[l.post_id].push(l);
        });

        setPosts(allPosts);
        setUsers(usersMap);
        setPostLikes(likesMap);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadFollowing = async () => {
    if (!user) return;
    const { data } = await supabase.from('followers').select('following_id').eq('follower_id', user.id);
    setFollowingUsers(new Set(data?.map(f => f.following_id) || []));
  };

  const processView = async (post: Post) => {
    if (!user || processingRef.current.has(post.id)) return;
    processingRef.current.add(post.id);
    try {
      await ensureUserProfile(supabase as any, { id: user.id, email: user.email });
      const { data } = await supabase.rpc('process_post_view', { p_post_id: post.id, p_viewer_id: user.id });
      const result = data as any;
      if (result?.success) {
        setProcessedPosts(prev => new Set(prev).add(post.id));
        if (result.charged) {
          toast({ title: '💰 Earned!', description: `⭐ ${result.stars_spent} → ₦${result.viewer_earn} cashback` });
        }
      }
    } finally {
      processingRef.current.delete(post.id);
    }
  };

  const handleLike = async (postId: string) => {
    if (!user) return;
    const existing = (postLikes[postId] || []).find((l: any) => l.user_id === user.id);
    if (existing) {
      await supabase.from('post_likes').delete().eq('id', existing.id);
      setPostLikes(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).filter((l: any) => l.id !== existing.id)
      }));
    } else {
      const { data } = await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id }).select().single();
      if (data) {
        setPostLikes(prev => ({
          ...prev,
          [postId]: [...(prev[postId] || []), data]
        }));
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

  const requireLogin = (msg?: string) => {
    setLoginMessage(msg || 'Sign in to continue');
    setShowLoginModal(true);
  };

  if (loading) {
    return (
      <div className="h-[100dvh] bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Desktop wrapper: centered with dark margins */}
      <div className="h-[100dvh] bg-black flex justify-center">
        <div className="relative w-full max-w-[480px] h-full">
          {/* Scrollable feed */}
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
                  <Button onClick={() => user ? navigate('/feed') : requireLogin('Login to create posts')}>
                    <Plus className="w-4 h-4 mr-1" /> Create Post
                  </Button>
                </div>
              </div>
            ) : (
              posts.map((post, index) => (
                <TikTokPost
                  key={post.id}
                  post={post}
                  postUser={users[post.user_id]}
                  isActive={index === activeIndex}
                  isLiked={(postLikes[post.id] || []).some((l: any) => l.user_id === user?.id)}
                  likesCount={postLikes[post.id]?.length || 0}
                  commentsCount={post.comments_count || 0}
                  isFollowing={followingUsers.has(post.user_id)}
                  isOwnPost={post.user_id === user?.id}
                  isMuted={isMuted}
                  onToggleMute={() => setIsMuted(!isMuted)}
                  onLike={() => handleLike(post.id)}
                  onFollow={() => handleFollow(post.user_id)}
                  onComment={() => {
                    setActiveCommentPostId(post.id);
                    setShowComments(true);
                  }}
                  onShare={() => {
                    setActiveSharePost(post);
                    setShowShareMenu(true);
                  }}
                  onProfile={() => navigate(`/profile/${post.user_id}`)}
                  onRequireLogin={requireLogin}
                  isLoggedIn={!!user}
                />
              ))
            )}
          </div>

          {/* Top header overlay */}
          <div className="absolute top-0 left-0 right-0 z-40 pointer-events-none">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 pointer-events-auto">
              <h1 className="text-lg font-black text-white drop-shadow-lg">Lernory</h1>
              <div className="flex items-center gap-2">
                {user && (
                  <Badge className="bg-yellow-500/90 text-black text-[10px] gap-0.5 font-bold shadow-lg">
                    <Star className="w-3 h-3 fill-current" /> Stars
                  </Badge>
                )}
                <button
                  onClick={() => navigate('/explore')}
                  className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
                >
                  <Search className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom navigation */}
          <div className="absolute bottom-0 left-0 right-0 z-40">
            <div className="flex items-center justify-around py-2 px-2 bg-black/80 backdrop-blur-md border-t border-white/10">
              <NavBtn icon={Home} label="Home" active onClick={() => feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
              <NavBtn icon={Search} label="Explore" onClick={() => navigate('/explore')} />
              <button
                onClick={() => user ? navigate('/feed') : requireLogin('Login to create posts')}
                className="w-12 h-8 rounded-lg bg-gradient-to-r from-primary to-accent flex items-center justify-center -mt-3 shadow-lg shadow-primary/30"
              >
                <Plus className="w-5 h-5 text-white" />
              </button>
              <NavBtn icon={MessageCircle} label="Chat" onClick={() => user ? navigate('/chat') : requireLogin('Login to chat')} />
              <NavBtn icon={User} label="Me" onClick={() => user ? navigate('/profile') : requireLogin('Login to view profile')} />
            </div>
          </div>
        </div>

        {/* Desktop side decorations */}
        <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-[calc(50%-240px)] bg-gradient-to-r from-black to-black/80" />
        <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-[calc(50%-240px)] bg-gradient-to-l from-black to-black/80" />
      </div>

      {/* Comments bottom sheet */}
      <AnimatePresence>
        {showComments && activeCommentPostId && (
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowComments(false)} />
            <motion.div
              className="absolute bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-card rounded-t-2xl max-h-[60vh] overflow-hidden"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
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

      {/* Share menu */}
      {showShareMenu && activeSharePost && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowShareMenu(false)} />
          <div className="relative max-w-[480px] w-full bg-card rounded-t-2xl p-4 z-10">
            <ShareMenu
              postId={activeSharePost.id}
              postTitle={activeSharePost.title}
              postImage={activeSharePost.media_urls?.[0]}
              postDescription={activeSharePost.body}
            />
            <Button variant="ghost" className="w-full mt-2" onClick={() => setShowShareMenu(false)}>Close</Button>
          </div>
        </div>
      )}

      {/* Login modal */}
      <LoginModal
        open={showLoginModal}
        onOpenChange={setShowLoginModal}
        message={loginMessage}
      />
    </>
  );
};

// Nav button helper
const NavBtn: React.FC<{
  icon: React.FC<any>;
  label: string;
  active?: boolean;
  onClick?: () => void;
}> = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-0.5">
    <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-white/50'}`} />
    <span className={`text-[10px] ${active ? 'text-white' : 'text-white/50'}`}>{label}</span>
  </button>
);

export default TikTokFeed;
