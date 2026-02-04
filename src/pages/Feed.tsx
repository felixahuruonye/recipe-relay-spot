import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageCircle, Star, Home, History, X, Lock, Timer, UserPlus } from 'lucide-react';
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
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ensureUserProfile } from '@/lib/ensureUserProfile';

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

// Post view timer component with improved logic
const PostViewTimer: React.FC<{
  post: Post;
  isVideo: boolean;
  onComplete: () => void;
  videoEnded?: boolean;
  isProcessed: boolean;
}> = ({ post, isVideo, onComplete, videoEnded, isProcessed }) => {
  const [timeLeft, setTimeLeft] = useState(isVideo ? null : 30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (isProcessed || completedRef.current) return;

    if (isVideo) {
      if (videoEnded && !completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    } else {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev === null || prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            if (!completedRef.current) {
              completedRef.current = true;
              onComplete();
            }
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isVideo, videoEnded, onComplete, isProcessed]);

  if (isProcessed) return null;

  if (isVideo) {
    return (
      <Badge className="absolute top-2 right-2 bg-primary/80 text-primary-foreground z-10">
        <Timer className="w-3 h-3 mr-1" />
        Watch to earn
      </Badge>
    );
  }

  return timeLeft ? (
    <Badge className="absolute top-2 right-2 bg-primary/80 text-primary-foreground animate-pulse z-10">
      <Timer className="w-3 h-3 mr-1" />
      {timeLeft}s
    </Badge>
  ) : null;
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
  const [expandedComments, setExpandedComments] = useState<{ [key: string]: boolean }>({});
  const [fullscreenMedia, setFullscreenMedia] = useState<string | null>(null);
  const [storylineUser, setStorylineUser] = useState<string | null>(null);
  const [stories, setStories] = useState<any[]>([]);
  const [selectedStoryUserId, setSelectedStoryUserId] = useState<string | null>(null);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [isCreatePostOpen, setisCreatePostOpen] = useState(false);
  const [processedPosts, setProcessedPosts] = useState<Set<string>>(new Set());
  const [videoEndedMap, setVideoEndedMap] = useState<{ [key: string]: boolean }>({});
  const processingPostsRef = useRef<Set<string>>(new Set());
  const [userStarBalance, setUserStarBalance] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Handle post ID from URL params
  useEffect(() => {
    const postId = searchParams.get('post');
    if (postId) {
      setTimeout(() => {
        const element = document.getElementById(`post-${postId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
    }
  }, [searchParams, posts]);

  useEffect(() => {
    if (user) {
      checkUserProfile();
      loadUserBalances();
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

  // Real-time wallet balance updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('wallet-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          const newData = payload.new as any;
          setUserStarBalance(newData.star_balance || 0);
          setWalletBalance(newData.wallet_balance || 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadUserBalances = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('star_balance, wallet_balance')
      .eq('id', user.id)
      .single();
    setUserStarBalance(data?.star_balance || 0);
    setWalletBalance(data?.wallet_balance || 0);
  };

  const loadCurrentUserProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('username, avatar_url')
      .eq('id', user.id)
      .single();
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
        if (!userStoryMap.has(story.user_id)) {
          userStoryMap.set(story.user_id, story);
        }
      });

      const userIds = Array.from(userStoryMap.keys());
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]));

      const storiesWithProfiles = Array.from(userStoryMap.values()).map(story => ({
        ...story,
        user_profile: profileMap.get(story.user_id)
      }));

      setStories(storiesWithProfiles);
    }
  };

  const checkUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        setNeedsProfileSetup(true);
        setLoading(false);
        return;
      }
      
      if (error) throw error;
      setUserProfile(data);
      setNeedsProfileSetup(false);
    } catch (error) {
      console.error('Error checking profile:', error);
      setLoading(false);
    }
  };

  const loadCommentCounts = async (postIds: string[]) => {
    if (postIds.length === 0) return;
    try {
      const counts = await Promise.all(
        postIds.map(async (id) => {
          const { count } = await (supabase as any)
            .from('post_comments')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', id);
          return { id, count: count || 0 };
        })
      );

      setPosts((prev) =>
        prev.map((p) => {
          const c = counts.find((x) => x.id === p.id);
          return { ...p, comments_count: c ? c.count : p.comments_count || 0 };
        })
      );
    } catch (e) {
      console.error('Error loading comment counts:', e);
    }
  };

  const fetchPosts = async () => {
    try {
      let query = supabase
        .from('posts')
        .select('*')
        .eq('status', 'approved')
        .eq('disabled', false);

      if (showOldPosts) {
        query = query.eq('post_status', 'viewed');
      } else {
        query = query.eq('post_status', 'new');
      }

      const { data: postsData, error: postsError } = await query
        .order('boosted', { ascending: false })
        .order('rating', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (postsError) throw postsError;

      let filteredPosts = postsData || [];
      if (user) {
        const { data: hiddenPosts } = await supabase
          .from('hidden_posts')
          .select('post_id')
          .eq('user_id', user.id);
        
        const hiddenPostIds = new Set(hiddenPosts?.map(h => h.post_id) || []);
        filteredPosts = postsData?.filter(post => !hiddenPostIds.has(post.id)) || [];
      }

      if (filteredPosts && filteredPosts.length > 0) {
        const userIds = [...new Set(filteredPosts.map(post => post.user_id))];
        
        const { data: usersData, error: usersError } = await supabase
          .from('user_profiles')
          .select('id, username, avatar_url, vip')
          .in('id', userIds);

        if (usersError) throw usersError;

        const usersLookup: { [key: string]: UserProfile } = {};
        usersData?.forEach(user => {
          usersLookup[user.id] = user;
        });

        const { data: likesData, error: likesError } = await supabase
          .from('post_likes')
          .select('*')
          .in('post_id', filteredPosts.map(p => p.id));

        if (likesError) throw likesError;

        const likesLookup: { [key: string]: PostLike[] } = {};
        likesData?.forEach(like => {
          if (!likesLookup[like.post_id]) {
            likesLookup[like.post_id] = [];
          }
          likesLookup[like.post_id].push(like);
        });

        setPosts(filteredPosts);
        setUsers(usersLookup);
        setPostLikes(likesLookup);

        await loadCommentCounts(filteredPosts.map((p) => p.id));
      } else {
        setPosts([]);
        setUsers({});
        setPostLikes({});
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      toast({
        title: "Error",
        description: "Failed to load posts. Please try again.",
        variant: "destructive"
      });
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
          if (updated[postId]) {
            updated[postId] = updated[postId].filter(like => like.id !== payload.old.id);
          }
          return updated;
        });
        setPosts(prev => prev.map(post => 
          post.id === payload.old.post_id ? { ...post, likes_count: Math.max(0, post.likes_count - 1) } : post
        ));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, () => fetchPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => fetchPosts())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleLike = async (postId: string) => {
    if (!user) return;

    const postLikesList = postLikes[postId] || [];
    const existingLike = postLikesList.find(like => like.user_id === user.id);

    try {
      if (existingLike) {
        const { error } = await supabase.from('post_likes').delete().eq('id', existingLike.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
        if (error) throw error;
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast({ title: "Error", description: "Failed to update like.", variant: "destructive" });
    }
  };

  const isPostLiked = (postId: string): boolean => {
    if (!user) return false;
    return (postLikes[postId] || []).some(like => like.user_id === user.id);
  };

  const getUsernamesWhoLiked = (postId: string): string[] => {
    return (postLikes[postId] || []).map(like => users[like.user_id]?.username || 'Unknown').filter(Boolean);
  };

  const processPostPayment = useCallback(async (post: Post) => {
    if (!user || processedPosts.has(post.id)) return;
    if (processingPostsRef.current.has(post.id)) return;
    processingPostsRef.current.add(post.id);

    try {
      const ensured = await ensureUserProfile(supabase as any, { id: user.id, email: user.email });
      if (!ensured.ok) {
        console.warn('ensureUserProfile failed (post view):', ensured.error);
      }

      // Process view via RPC (handles all logic including duplicate check)
      const { data, error } = await supabase.rpc('process_post_view', {
        p_post_id: post.id,
        p_viewer_id: user.id
      });

      if (error) {
        console.error('RPC Error:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to process view. Please try again.',
          variant: 'destructive'
        });
        return;
      }

      const result = data as any;

      if (!result?.success) {
        toast({
          title: "Can't Earn",
          description: result?.message || 'This view could not be processed.',
          variant: 'destructive'
        });
        return;
      }

      // Mark as processed only after RPC confirms it handled/recorded the view.
      setProcessedPosts(prev => new Set(prev).add(post.id));

      await loadUserBalances();

      if (result.insufficient_stars) {
        toast({
          title: 'No Stars • No Earnings',
          description: `You watched this post but didn't earn because you have ${result.available}⭐ (needs ${result.required}⭐).`,
          variant: 'destructive'
        });
        return;
      }

      if (result.charged) {
        toast({
          title: '💰 Earned Cashback!',
          description: `⭐ ${result.stars_spent} Stars deducted. You earned ₦${result.viewer_earn}!`,
        });
        return;
      }

      if (result.already_viewed) {
        toast({
          title: 'Already Viewed',
          description: "You can't earn from this post again",
        });
        return;
      }

      toast({
        title: 'Post Viewed',
        description: 'This is a free post - no earnings',
      });
    } catch (error) {
      console.error('Error processing post payment:', error);
      toast({
        title: 'Error',
        description: 'Failed to process view. Please try again.',
        variant: 'destructive'
      });
    } finally {
      processingPostsRef.current.delete(post.id);
    }
  }, [user, processedPosts, toast]);

  const handleProfileClick = (userId: string) => {
    navigate(`/profile/${userId}`);
  };

  const toggleComments = (postId: string) => {
    setExpandedComments(prev => ({ ...prev, [postId]: !prev[postId] }));
  };

  const handleVideoEnd = (postId: string) => {
    setVideoEndedMap(prev => ({ ...prev, [postId]: true }));
  };

  if (needsProfileSetup) {
    return <ProfileSetup onComplete={() => { setNeedsProfileSetup(false); checkUserProfile(); }} />;
  }

  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-muted rounded-full"></div>
                  <div className="h-4 bg-muted rounded w-24"></div>
                </div>
                <div className="h-6 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary">SaveMore Community</h1>
          <p className="text-muted-foreground">Share your food experiences</p>
          <div className="flex justify-center gap-2 mt-2">
            <Badge className="bg-yellow-500 text-black">⭐ {userStarBalance} Stars</Badge>
            <Badge variant="secondary">₦{walletBalance.toLocaleString()} Wallet</Badge>
          </div>
        </div>

        <NewSearchBar />

        {/* Stories Strip */}
        <section aria-label="Stories" className="-mx-2">
          <div className="overflow-x-auto px-2">
            <div className="flex items-start gap-3">
              <div className="scale-110">
                <StorylineCard
                  type="create"
                  avatarUrl={currentUserProfile?.avatar_url}
                  onSelect={() => setShowCreateStory(true)}
                />
              </div>

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
        </section>

        <CreatePost
          onPostCreated={fetchPosts}
          isOpen={isCreatePostOpen}
          onOpenChange={setisCreatePostOpen}
        />
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <Button
          variant={!showOldPosts ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowOldPosts(false)}
          className="flex-1"
        >
          <Home className="h-4 w-4 mr-2" />
          New Posts
        </Button>
        <Button
          variant={showOldPosts ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowOldPosts(true)}
          className="flex-1"
        >
          <History className="h-4 w-4 mr-2" />
          View Last Posts
        </Button>
      </div>

      {/* Posts */}
      <div className="space-y-3 sm:space-y-4">
        {posts.map((post) => {
          const postUser = users[post.user_id];
          const likedUsernames = getUsernamesWhoLiked(post.id);
          const currentUserLiked = isPostLiked(post.id);
          const hasMedia = post.media_urls && post.media_urls.length > 0;
          const isVideo = hasMedia && (post.media_urls[0].match(/\.(mp4|webm|ogg)$/i) || post.media_urls[0].includes('video'));
          const isPaidPost = post.star_price && post.star_price > 0 && post.user_id !== user?.id;
          const insufficientStars = isPaidPost && userStarBalance < (post.star_price || 0);
          const isProcessed = processedPosts.has(post.id);
          
          return (
            <Card key={post.id} id={`post-${post.id}`} className="overflow-hidden glass-card card-3d">
              <CardHeader className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => handleProfileClick(post.user_id)}
                    className="flex items-center space-x-2 sm:space-x-3 hover:opacity-80 transition-opacity relative"
                  >
                    <div className="relative">
                      <Avatar className="w-9 h-9 sm:w-10 sm:h-10 border-2 border-primary/50">
                        <AvatarImage src={postUser?.avatar_url} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {postUser?.username?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      {stories.some((s: any) => s.user_id === post.user_id) && (
                        <div 
                          className="absolute inset-0 rounded-full border-2 border-accent cursor-pointer neon-glow"
                          onClick={(e) => { e.stopPropagation(); setStorylineUser(post.user_id); }}
                        />
                      )}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-sm sm:text-base">{postUser?.username || 'Anonymous'}</span>
                        {postUser?.vip && (
                          <Badge variant="secondary" className="text-xs bg-yellow-400 text-black">
                            <Star className="w-3 h-3 mr-1 fill-current" />VIP
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(post.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                  <div className="flex items-center space-x-2">
                    {isPaidPost && (
                      <Badge className="bg-yellow-500 text-black">
                        {post.star_price}<Star className="w-3 h-3 ml-1 inline fill-current" />
                      </Badge>
                    )}
                    {isProcessed && (
                      <Badge variant="secondary" className="text-xs">✓ Viewed</Badge>
                    )}
                    {post.boosted && <Badge variant="outline" className="text-xs">Boosted</Badge>}
                    <PostMenu postId={post.id} postOwnerId={post.user_id} onPostDeleted={fetchPosts} />
                  </div>
                </div>
                <div className="mt-2 sm:mt-0">
                  <h3 className="font-semibold mb-2 text-sm sm:text-base">{post.title}</h3>
                  <Badge variant="outline" className="text-xs">{post.category}</Badge>
                </div>
              </CardHeader>
            
              <CardContent>
                <p className="text-sm mb-4 whitespace-pre-line">{post.body}</p>
                
                {/* Media with payment timer */}
                {hasMedia && (
                  <div className="mb-4 space-y-2 relative">
                    {post.media_urls.map((url, index) => {
                      const isVideoUrl = url.match(/\.(mp4|webm|ogg)$/i) || url.includes('video');

                      return (
                        <div key={index} className="relative" onClick={() => !isVideoUrl && setFullscreenMedia(url)}>
                          {isPaidPost && !isProcessed && (
                            <PostViewTimer
                              post={post}
                              isVideo={!!isVideoUrl}
                              videoEnded={videoEndedMap[post.id]}
                              onComplete={() => processPostPayment(post)}
                              isProcessed={isProcessed}
                            />
                          )}

                          {insufficientStars && isPaidPost && !isProcessed && (
                            <Badge className="absolute left-2 top-2 bg-destructive/90 text-destructive-foreground z-10">
                              No Stars • No earnings
                            </Badge>
                          )}

                          {isVideoUrl ? (
                            <VideoPlayer src={url} autoPlay onEnded={() => handleVideoEnd(post.id)} />
                          ) : (
                            <img
                              src={url}
                              alt={`Post media ${index + 1}`}
                              className="w-full rounded-lg max-h-96 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              loading="lazy"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reactions and Actions */}
                <div className="pt-4 border-t space-y-3">
                  {likedUsernames.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Liked by {likedUsernames.slice(0, 3).join(', ')}
                      {likedUsernames.length > 3 && ` and ${likedUsernames.length - 3} others`}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className={`p-0 ${currentUserLiked ? 'text-red-500' : ''}`}
                        onClick={() => handleLike(post.id)}
                      >
                        <Heart className={`w-4 h-4 mr-1 ${currentUserLiked ? 'fill-current' : ''}`} />
                        <span className="text-xs font-medium">{postLikes[post.id]?.length || 0}</span>
                      </Button>
                      <Button variant="ghost" size="sm" className="p-0" onClick={() => toggleComments(post.id)}>
                        <MessageCircle className="w-4 h-4 mr-1" />
                        <span className="text-xs font-medium">{post.comments_count || 0}</span>
                      </Button>
                    </div>
                    <ShareMenu postId={post.id} postTitle={post.title} />
                  </div>

                  {expandedComments[post.id] && (
                    <div className="mt-4 pt-4 border-t">
                      <CommentSection postId={post.id} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {posts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {showOldPosts ? 'No viewed posts yet.' : 'No new posts yet. Be the first to share!'}
          </p>
        </div>
      )}

      {/* Fullscreen Media Dialog */}
      <Dialog open={!!fullscreenMedia} onOpenChange={() => setFullscreenMedia(null)}>
        <DialogContent className="max-w-screen max-h-screen p-0 bg-black">
          <button
            onClick={() => setFullscreenMedia(null)}
            className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <X className="h-6 w-6" />
          </button>
          {fullscreenMedia && (
            <img src={fullscreenMedia} alt="Fullscreen" className="w-full h-full object-contain" />
          )}
        </DialogContent>
      </Dialog>

      {/* Storyline Viewers */}
      {storylineUser && (
        <EnhancedStorylineViewer userId={storylineUser} open={!!storylineUser} onClose={() => setStorylineUser(null)} />
      )}

      {selectedStoryUserId && (
        <EnhancedStorylineViewer
          userId={selectedStoryUserId}
          open={showStoryViewer}
          onClose={() => { setShowStoryViewer(false); setSelectedStoryUserId(null); }}
        />
      )}

      {showCreateStory && (
        <CreateStoryline 
          onCreated={() => { setShowCreateStory(false); loadUserStories(); }}
        />
      )}
    </div>
  );
};

export default Feed;
