import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageCircle, Star, Home, History, X, Plus } from 'lucide-react';
import { StorylineViewer } from '@/components/Storyline/StorylineViewer';
import { CreateStoryline } from '@/components/Storyline/CreateStoryline';
import { StorylineCard } from '@/components/Storyline/StorylineCard';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import CreatePost from '@/components/Posts/CreatePost';
import ProfileSetup from '@/components/Profile/ProfileSetup';
import { SearchBar } from '@/components/Feed/SearchBar';
import { CommentSection } from '@/components/Feed/CommentSection';
import { VideoPlayer } from '@/components/Feed/VideoPlayer';
import { ShareMenu } from '@/components/Feed/ShareMenu';
import { PostMenu } from '@/components/Feed/PostMenu';
import { Dialog, DialogContent } from '@/components/ui/dialog';

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

const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
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
  const [userStories, setUserStories] = useState<{ [key: string]: number }>({});
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      checkUserProfile();
    }
  }, [user]);

  useEffect(() => {
    if (userProfile) {
      fetchPosts();
      setupRealtimeSubscription();
    }
  }, [userProfile]);

  useEffect(() => {
    if (posts.length > 0) {
      loadUserStories();
    }
  }, [posts]);

  const checkUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist
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

  const loadUserStories = async () => {
    // Get all unique user IDs from posts
    const userIds = [...new Set(posts.map(p => p.user_id))];
    if (userIds.length === 0) return;

    // Count stories for each user
    const storyCounts: { [key: string]: number } = {};
    for (const userId of userIds) {
      const { count } = await (supabase as any)
        .from('user_storylines')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString());
      
      storyCounts[userId] = count || 0;
    }
    setUserStories(storyCounts);
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
        .eq('status', 'approved');

      if (showOldPosts && user) {
        // Get posts the user has already viewed
        const { data: viewedPostIds } = await supabase
          .from('post_views')
          .select('post_id')
          .eq('user_id', user.id);

        const viewedIds = viewedPostIds?.map(v => v.post_id) || [];
        if (viewedIds.length > 0) {
          query = query.in('id', viewedIds);
        }
      } else if (user) {
        // Get posts the user hasn't viewed yet and hidden posts
        const { data: viewedPostIds } = await supabase
          .from('post_views')
          .select('post_id')
          .eq('user_id', user.id);

        const { data: hiddenPostIds } = await supabase
          .from('hidden_posts')
          .select('post_id')
          .eq('user_id', user.id);

        const viewedIds = viewedPostIds?.map(v => v.post_id) || [];
        const hiddenIds = hiddenPostIds?.map(h => h.post_id) || [];
        const excludeIds = [...new Set([...viewedIds, ...hiddenIds])];
        
        if (excludeIds.length > 0) {
          query = query.not('id', 'in', `(${excludeIds.join(',')})`);
        }
      }

      const { data: postsData, error: postsError } = await query
        .order('boosted', { ascending: false })
        .order('rating', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (postsError) throw postsError;

      if (postsData && postsData.length > 0) {
        // Get unique user IDs
        const userIds = [...new Set(postsData.map(post => post.user_id))];
        
        // Fetch user profiles
        const { data: usersData, error: usersError } = await supabase
          .from('user_profiles')
          .select('id, username, avatar_url, vip')
          .in('id', userIds);

        if (usersError) throw usersError;

        // Create users lookup
        const usersLookup: { [key: string]: UserProfile } = {};
        usersData?.forEach(user => {
          usersLookup[user.id] = user;
        });

        // Fetch post likes
        const { data: likesData, error: likesError } = await supabase
          .from('post_likes')
          .select('*')
          .in('post_id', postsData.map(p => p.id));

        if (likesError) throw likesError;

        // Group likes by post_id
        const likesLookup: { [key: string]: PostLike[] } = {};
        likesData?.forEach(like => {
          if (!likesLookup[like.post_id]) {
            likesLookup[like.post_id] = [];
          }
          likesLookup[like.post_id].push(like);
        });

        setPosts(postsData);
        setUsers(usersLookup);
        setPostLikes(likesLookup);

        // Load comment counts for these posts
        await loadCommentCounts(postsData.map((p) => p.id));
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
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
          filter: 'status=eq.approved'
        },
        () => {
          fetchPosts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_likes'
        },
        (payload) => {
          setPostLikes(prev => {
            const updated = { ...prev };
            const postId = payload.new.post_id;
            if (!updated[postId]) {
              updated[postId] = [];
            }
            updated[postId].push(payload.new as PostLike);
            return updated;
          });
          
          // Update likes count on the post
          setPosts(prev => prev.map(post => 
            post.id === payload.new.post_id 
              ? { ...post, likes_count: post.likes_count + 1 }
              : post
          ));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'post_likes'
        },
        (payload) => {
          setPostLikes(prev => {
            const updated = { ...prev };
            const postId = payload.old.post_id;
            if (updated[postId]) {
              updated[postId] = updated[postId].filter(like => like.id !== payload.old.id);
            }
            return updated;
          });
          
          // Update likes count on the post
          setPosts(prev => prev.map(post => 
            post.id === payload.old.post_id 
              ? { ...post, likes_count: Math.max(0, post.likes_count - 1) }
              : post
          ));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'posts'
        },
        () => {
          fetchPosts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_comments',
        },
        () => {
          fetchPosts();
        }
      )
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
        // Unlike
        const { error } = await supabase
          .from('post_likes')
          .delete()
          .eq('id', existingLike.id);

        if (error) throw error;
      } else {
        // Like
        const { error } = await supabase
          .from('post_likes')
          .insert({
            post_id: postId,
            user_id: user.id
          });

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast({
        title: "Error",
        description: "Failed to update like. Please try again.",
        variant: "destructive"
      });
    }
  };

  const isPostLiked = (postId: string): boolean => {
    if (!user) return false;
    const postLikesList = postLikes[postId] || [];
    return postLikesList.some(like => like.user_id === user.id);
  };

  const getUsernamesWhoLiked = (postId: string): string[] => {
    const postLikesList = postLikes[postId] || [];
    return postLikesList.map(like => users[like.user_id]?.username || 'Unknown').filter(Boolean);
  };

  const trackPostView = async (postId: string) => {
    if (!user) return;

    // Insert view if it doesn't exist
    await supabase.from('post_views').insert({
      post_id: postId,
      user_id: user.id,
    }).select().single();

    // Update view count
    const { data: post } = await supabase
      .from('posts')
      .select('view_count')
      .eq('id', postId)
      .single();

    if (post) {
      await supabase
        .from('posts')
        .update({ view_count: (post.view_count || 0) + 1 })
        .eq('id', postId);
    }
  };

  const handleProfileClick = (userId: string) => {
    navigate(`/profile/${userId}`);
  };

  const toggleComments = (postId: string) => {
    setExpandedComments(prev => ({ ...prev, [postId]: !prev[postId] }));
  };

  useEffect(() => {
    // Track views for visible posts
    posts.forEach(post => {
      trackPostView(post.id);
    });
  }, [posts]);

  if (needsProfileSetup) {
    return <ProfileSetup onComplete={() => {
      setNeedsProfileSetup(false);
      checkUserProfile();
    }} />;
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
        </div>
        
        <SearchBar />
        <div className="flex justify-end">
          <CreateStoryline onCreated={loadUserStories} />
        </div>
        <CreatePost onPostCreated={fetchPosts} />
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <Button
          variant={!showOldPosts ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setShowOldPosts(false);
            fetchPosts();
          }}
          className="flex-1"
        >
          <Home className="h-4 w-4 mr-2" />
          New Posts
        </Button>
        <Button
          variant={showOldPosts ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setShowOldPosts(true);
            fetchPosts();
          }}
          className="flex-1"
        >
          <History className="h-4 w-4 mr-2" />
          View Last Posts
        </Button>
      </div>

      {/* Posts */}
      <div className="space-y-4">
        {posts.map((post) => {
          const postUser = users[post.user_id];
          const likedUsernames = getUsernamesWhoLiked(post.id);
          const currentUserLiked = isPostLiked(post.id);
          
          return (
            <Card key={post.id} id={`post-${post.id}`} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between">
                   <button
                     onClick={() => handleProfileClick(post.user_id)}
                     className="flex items-center space-x-3 hover:opacity-80 transition-opacity relative"
                   >
                     <div className="relative">
                       <Avatar className="w-10 h-10">
                         <AvatarImage src={postUser?.avatar_url} />
                         <AvatarFallback>
                           {postUser?.username?.charAt(0).toUpperCase() || 'U'}
                         </AvatarFallback>
                       </Avatar>
                       {userStories[post.user_id] > 0 && (
                         <div 
                           className="absolute inset-0 rounded-full border-2 border-blue-500 cursor-pointer"
                           onClick={(e) => {
                             e.stopPropagation();
                             setStorylineUser(post.user_id);
                           }}
                         />
                       )}
                     </div>
                    <div className="text-left">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold">{postUser?.username || 'Anonymous'}</span>
                        {postUser?.vip && (
                          <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                            <Star className="w-3 h-3 mr-1" />
                            VIP
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(post.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                  <div className="flex items-center space-x-2">
                    {post.boosted && (
                      <Badge variant="outline" className="text-xs">Boosted</Badge>
                    )}
                    {post.rating > 0 && (
                      <Badge variant="outline" className="text-xs">★ {post.rating}</Badge>
                    )}
                    <PostMenu 
                      postId={post.id} 
                      postOwnerId={post.user_id}
                      onPostDeleted={fetchPosts}
                    />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">{post.title}</h3>
                  <Badge variant="outline" className="text-xs">{post.category}</Badge>
                </div>
              </CardHeader>
              
              <CardContent>
                <p className="text-sm mb-4 whitespace-pre-line">{post.body}</p>
                
                {/* Media */}
                {post.media_urls && post.media_urls.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {post.media_urls.map((url, index) => {
                      const isVideo = url.match(/\.(mp4|webm|ogg)$/i) || url.includes('video');
                      
                      return (
                        <div key={index} onClick={() => !isVideo && setFullscreenMedia(url)}>
                          {isVideo ? (
                            <VideoPlayer src={url} autoPlay />
                          ) : (
                            <img 
                              src={url} 
                              alt={`Post media ${index + 1}`}
                              className="w-full rounded-lg max-h-96 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reactions and Actions */}
                <div className="pt-4 border-t space-y-3">
                  {/* Like usernames */}
                  {likedUsernames.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Liked by {likedUsernames.slice(0, 3).join(', ')}
                      {likedUsernames.length > 3 && ` and ${likedUsernames.length - 3} others`}
                    </div>
                  )}
                  
                  {/* Action buttons */}
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
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="p-0"
                        onClick={() => toggleComments(post.id)}
                      >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        <span className="text-xs font-medium">{post.comments_count || 0}</span>
                      </Button>
                    </div>
                    <ShareMenu postId={post.id} postTitle={post.title} />
                  </div>

                  {/* Comments Section */}
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
            <img
              src={fullscreenMedia}
              alt="Fullscreen"
              className="w-full h-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Storyline Viewer */}
      {storylineUser && (
        <StorylineViewer
          userId={storylineUser}
          open={!!storylineUser}
          onClose={() => setStorylineUser(null)}
        />
      )}
    </div>
  );
};

export default Feed;