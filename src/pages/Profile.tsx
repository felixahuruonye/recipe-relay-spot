import React, { useEffect, useState } from 'react';
import { updateMetaTags, resetMetaTags } from '@/lib/updateMetaTags';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Crown, Star, ShoppingBag, Settings, LogOut, Edit, Heart, MessageCircle, UserPlus, Send, Eye, Lock, Repeat2, Bookmark, Play, Brain, BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useParams, useNavigate } from 'react-router-dom';
import { VideoPlayer } from '@/components/Feed/VideoPlayer';
import { CommentSection } from '@/components/Feed/CommentSection';
import { ShareMenu } from '@/components/Feed/ShareMenu';
import { PostMenu } from '@/components/Feed/PostMenu';
import { EditProfile } from '@/components/Profile/EditProfile';
import { WithdrawalForm } from '@/components/Profile/WithdrawalForm';
import { FollowersList } from '@/components/Profile/FollowersList';
import { PostViewers } from '@/components/Profile/PostViewers';

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  bio: string;
  avatar_url: string;
  vip: boolean;
  vip_expires_at: string;
  wallet_balance: number;
  star_balance: number;
  follower_count: number;
  following_count: number;
  post_count: number;
  total_reactions: number;
  created_at: string;
}

const Profile = () => {
  const { user, signOut } = useAuth();
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userPosts, setUserPosts] = useState([]);
  const [postLikes, setPostLikes] = useState<{ [key: string]: any[] }>({});
  const [expandedComments, setExpandedComments] = useState<{ [key: string]: boolean }>({});
  const [isFollowing, setIsFollowing] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const { toast } = useToast();

  const profileId = userId || user?.id;
  const isOwnProfile = !userId || userId === user?.id;

  useEffect(() => {
    if (profileId) {
      fetchProfile();
      fetchUserPosts();
      if (!isOwnProfile) {
        checkFollowStatus();
      }
      setupRealtimeSubscription();
    }
  }, [profileId]);

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel(`profile-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, () => fetchUserPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => { fetchUserPosts(); fetchProfile(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'post_views' }, () => fetchUserPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => fetchUserPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'followers' }, () => fetchProfile())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  };

  const fetchProfile = async () => {
    if (!profileId) return;
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', profileId)
        .single();
      if (error) throw error;
      setProfile(data);
      // Update OG meta tags for deep linking
      updateMetaTags({
        title: `${data.username} on Lenory`,
        description: data.bio || `Check out ${data.username}'s profile on Lenory Social`,
        image: data.avatar_url || `${window.location.origin}/lenory-logo.png`,
        url: `${window.location.origin}/profile/${data.id}`,
        type: 'profile',
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({ title: "Error", description: "Failed to load profile", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPosts = async () => {
    if (!profileId) return;
    try {
      const { data: postsData, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', profileId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });
      if (error) throw error;

      let likesLookup: { [key: string]: any[] } = {};
      if (postsData && postsData.length > 0) {
        const { data: likesData } = await supabase
          .from('post_likes')
          .select('*')
          .in('post_id', postsData.map(p => p.id));

        likesLookup = {};
        likesData?.forEach(like => {
          if (!likesLookup[like.post_id]) likesLookup[like.post_id] = [];
          likesLookup[like.post_id].push(like);
        });
      }

      setPostLikes(likesLookup);

      const postsWithCounts = await Promise.all(
        (postsData || []).map(async (p: any) => {
          const { count } = await (supabase as any)
            .from('post_comments')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', p.id);
          const { count: viewsCount } = await (supabase as any)
            .from('post_views')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', p.id);
          return { ...p, comments_count: count || 0, view_count: viewsCount ?? p.view_count ?? 0 };
        })
      );

      setUserPosts(postsWithCounts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  };

  const handleLike = async (postId: string) => {
    if (!user) return;
    const postLikesList = postLikes[postId] || [];
    const existingLike = postLikesList.find(like => like.user_id === user.id);
    try {
      if (existingLike) {
        await supabase.from('post_likes').delete().eq('id', existingLike.id);
      } else {
        await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
      }
      fetchUserPosts();
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const isPostLiked = (postId: string): boolean => {
    if (!user) return false;
    return (postLikes[postId] || []).some(like => like.user_id === user.id);
  };

  const handleVipUpgrade = () => {
    window.open(`https://paystack.com/pay/vip-subscription?metadata=user_id:${user?.id}|type:vip`, '_blank');
  };

  const handleBuyStars = () => {
    navigate('/star-marketplace');
  };

  const checkFollowStatus = async () => {
    if (!user || !profileId) return;
    const { data } = await supabase
      .from('followers')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', profileId)
      .single();
    setIsFollowing(!!data);
  };

  const handleFollow = async () => {
    if (!user || !profileId) return;
    try {
      if (isFollowing) {
        await supabase.from('followers').delete().eq('follower_id', user.id).eq('following_id', profileId);
        setIsFollowing(false);
        toast({ title: "Unfollowed successfully" });
      } else {
        await supabase.from('followers').insert({ follower_id: user.id, following_id: profileId });
        setIsFollowing(true);
        toast({ title: "Following successfully" });
      }
      fetchProfile();
    } catch (error) {
      console.error('Error toggling follow:', error);
    }
  };

  const handleMessage = () => {
    if (profileId) navigate('/chat', { state: { recipientId: profileId } });
  };

  const handleLogout = async () => { await signOut(); };

  if (loading) {
    return (
      <div className="p-4 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="h-20 bg-muted rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <div className="p-4 text-center"><p>Profile not found</p></div>;
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
            <Avatar className="w-24 h-24 cursor-pointer" onClick={() => navigate(`/profile/${profile.id}`)}>
              <AvatarImage src={profile.avatar_url} />
              <AvatarFallback className="text-2xl">
                {profile.username.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 text-center md:text-left space-y-2">
              <div className="flex flex-col md:flex-row items-center md:items-start space-y-2 md:space-y-0 md:space-x-3">
                <h1 className="text-2xl font-bold">{profile.username}</h1>
                {profile.vip && (
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                    <Crown className="w-3 h-3 mr-1" />
                    VIP
                  </Badge>
                )}
              </div>
              
              {profile.full_name && <p className="text-muted-foreground">{profile.full_name}</p>}
              {profile.bio && <p className="text-sm">{profile.bio}</p>}
              
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-2">
                <button className="text-center hover:opacity-70 transition-opacity" onClick={() => setShowFollowers(true)}>
                  <div className="text-lg font-bold">{profile.follower_count || 0}</div>
                  <div className="text-xs text-muted-foreground">Followers</div>
                </button>
                <button className="text-center hover:opacity-70 transition-opacity" onClick={() => setShowFollowing(true)}>
                  <div className="text-lg font-bold">{profile.following_count || 0}</div>
                  <div className="text-xs text-muted-foreground">Following</div>
                </button>
                <div className="text-center">
                  <div className="text-lg font-bold">{profile.post_count || 0}</div>
                  <div className="text-xs text-muted-foreground">Posts</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold">{profile.total_reactions || 0}</div>
                  <div className="text-xs text-muted-foreground">Reactions</div>
                </div>
              </div>

              {isOwnProfile && (
                <div className="flex flex-col space-y-3 pt-2">
                  <button
                    onClick={() => navigate('/wallet')}
                    className="w-full rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 to-accent/15 p-4 text-left transition-transform active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Wallet balance</p>
                        <p className="text-2xl font-bold">₦{profile.wallet_balance}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stars</p>
                        <p className="flex items-center justify-end gap-1 text-lg font-bold">
                          <Star className="w-4 h-4 text-yellow-500" />{profile.star_balance}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">Tap to open wallet, buy Stars & withdraw</p>
                  </button>
                  <div className="w-full max-w-xs mx-auto md:mx-0">
                    <WithdrawalForm isVip={!!profile.vip} onUpgrade={() => navigate('/vip-subscription')} />
                  </div>
                </div>
              )}

            </div>
            
            <div className="flex flex-col space-y-2">
              {isOwnProfile ? (
                <>
                  {!profile.vip && (
                    <Button size="sm" className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold hover:from-yellow-400 hover:to-orange-400" onClick={() => navigate('/vip-subscription')}>
                      <Crown className="w-4 h-4 mr-2" />Upgrade to VIP
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => navigate('/musician')}>
                    🎵 Musician Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditProfileOpen(true)}>
                    <Edit className="w-4 h-4 mr-2" />Edit Profile
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/marketplace')}>
                    <ShoppingBag className="w-4 h-4 mr-2" />Marketplace
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />Logout
                  </Button>
                </>
              ) : (
                <>
                  <Button variant={isFollowing ? "outline" : "default"} size="sm" onClick={handleFollow}>
                    <UserPlus className="w-4 h-4 mr-2" />{isFollowing ? 'Following' : 'Follow'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleMessage}>
                    <Send className="w-4 h-4 mr-2" />Message
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/marketplace')}>
                    <ShoppingBag className="w-4 h-4 mr-2" />Marketplace
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleBuyStars}>
                    <Star className="w-4 h-4 mr-2" />Buy Star
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* VIP Section */}
      {/* Creator Dashboard Button */}
      {isOwnProfile && (
        <Button onClick={() => navigate('/creator-dashboard')} className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 h-12 text-white font-semibold">
          <BarChart3 className="w-5 h-5 mr-2" />
          Creator Dashboard
        </Button>
      )}

      {/* Tabs for Posts */}
      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList className={`grid w-full ${isOwnProfile ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <TabsTrigger value="posts">{isOwnProfile ? 'My Posts' : 'Posts'}</TabsTrigger>
          {isOwnProfile && <TabsTrigger value="ai"><Brain className="w-4 h-4 mr-2" />Connect Lenory AI</TabsTrigger>}
        </TabsList>

        <TabsContent value="posts" className="space-y-4">
          {/* Filter Buttons */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Button variant="outline" size="sm" className="gap-1 flex-shrink-0">
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Privacy</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1 flex-shrink-0">
              <Repeat2 className="w-4 h-4" />
              <span className="hidden sm:inline">Reposts</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1 flex-shrink-0">
              <Bookmark className="w-4 h-4" />
              <span className="hidden sm:inline">Bookmarks</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1 flex-shrink-0">
              <Heart className="w-4 h-4" />
              <span className="hidden sm:inline">Reactions</span>
            </Button>
          </div>

          {/* Posts Grid */}
          {userPosts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {userPosts.map((post: any) => {
                const firstMediaUrl = post.media_urls?.[0];
                const isVideo = firstMediaUrl?.match(/\.(mp4|webm|ogg|mov)$/i) || firstMediaUrl?.includes('video');

                return (
                  <div
                    key={post.id}
                    className="group relative rounded-lg overflow-hidden bg-muted aspect-square cursor-pointer"
                    onClick={() => navigate(`/?post=${post.id}`)}
                  >
                    {/* Thumbnail */}
                    {firstMediaUrl ? (
                      isVideo ? (
                        <div className="w-full h-full bg-black flex items-center justify-center">
                          <video
                            src={firstMediaUrl}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <img
                          src={firstMediaUrl}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                        <p className="text-center text-muted-foreground text-xs px-4">{post.title}</p>
                      </div>
                    )}

                    {/* Overlay - Show on hover */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-2">
                        <Play className="w-12 h-12 text-white fill-white" />
                        <p className="text-white text-sm font-medium">{post.view_count || 0} views</p>
                      </div>
                    </div>

                    {/* Pinned Badge */}
                    {post.pinned && (
                      <Badge className="absolute top-2 left-2 z-10">Pinned</Badge>
                    )}

                    {/* View Count Badge */}
                    <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 bg-black/60 text-white px-2 py-1 rounded text-xs font-medium">
                      <Play className="w-3 h-3 fill-current" />
                      {post.view_count || 0}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-3">No posts yet</p>
                <p className="text-sm text-muted-foreground">Start sharing content to get your posts displayed here</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {isOwnProfile && (
          <TabsContent value="ai">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  Connect Lenory AI
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Integrate AI-powered features into your content creation and audience insights. Click below to access full Lenory AI integration settings.
                </p>
                <Button onClick={() => navigate('/connect-lenory-ai')} className="w-full gap-2">
                  <Brain className="w-4 h-4" />
                  Go to Lenory AI Setup
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Profile Dialog */}
      {isOwnProfile && profile && (
        <EditProfile
          open={editProfileOpen}
          onOpenChange={setEditProfileOpen}
          currentProfile={{ username: profile.username, bio: profile.bio, avatar_url: profile.avatar_url }}
          onProfileUpdated={fetchProfile}
        />
      )}

      {/* Followers/Following Dialogs */}
      <FollowersList userId={profileId!} type="followers" open={showFollowers} onOpenChange={setShowFollowers} count={profile.follower_count || 0} />
      <FollowersList userId={profileId!} type="following" open={showFollowing} onOpenChange={setShowFollowing} count={profile.following_count || 0} />
    </div>
  );
};

export default Profile;
