import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Crown, Star, ShoppingBag, Settings, LogOut, Edit, Heart, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useParams } from 'react-router-dom';
import { VideoPlayer } from '@/components/Feed/VideoPlayer';
import { CommentSection } from '@/components/Feed/CommentSection';
import { ShareMenu } from '@/components/Feed/ShareMenu';
import { PostMenu } from '@/components/Feed/PostMenu';

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
  created_at: string;
}

const Profile = () => {
  const { user, signOut } = useAuth();
  const { userId } = useParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userPosts, setUserPosts] = useState([]);
  const [postLikes, setPostLikes] = useState<{ [key: string]: any[] }>({});
  const [expandedComments, setExpandedComments] = useState<{ [key: string]: boolean }>({});
  const { toast } = useToast();

  const profileId = userId || user?.id;

  useEffect(() => {
    if (profileId) {
      fetchProfile();
      fetchUserPosts();
    }
  }, [profileId]);

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
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: "Error",
        description: "Failed to load profile",
        variant: "destructive"
      });
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

      if (postsData && postsData.length > 0) {
        const { data: likesData } = await supabase
          .from('post_likes')
          .select('*')
          .in('post_id', postsData.map(p => p.id));

        const likesLookup: { [key: string]: any[] } = {};
        likesData?.forEach(like => {
          if (!likesLookup[like.post_id]) {
            likesLookup[like.post_id] = [];
          }
          likesLookup[like.post_id].push(like);
        });

        setPostLikes(likesLookup);
      }

      setUserPosts(postsData || []);
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
    const postLikesList = postLikes[postId] || [];
    return postLikesList.some(like => like.user_id === user.id);
  };

  const handleVipUpgrade = () => {
    // Open Paystack VIP link
    window.open(`https://paystack.com/pay/vip-subscription?metadata=user_id:${user?.id}|type:vip`, '_blank');
  };

  const handleBuyStars = () => {
    // Open Paystack Stars purchase link
    window.open(`https://paystack.com/pay/buy-stars?metadata=user_id:${user?.id}|type:stars`, '_blank');
  };

  const handleLogout = async () => {
    await signOut();
  };

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
    return (
      <div className="p-4 text-center">
        <p>Profile not found</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
            <Avatar className="w-24 h-24">
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
              
              {profile.full_name && (
                <p className="text-muted-foreground">{profile.full_name}</p>
              )}
              
              {profile.bio && (
                <p className="text-sm">{profile.bio}</p>
              )}
              
              <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start space-y-2 sm:space-y-0 sm:space-x-4 pt-2">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">₦{profile.wallet_balance}</span>
                  <span className="text-xs text-muted-foreground">Wallet</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Star className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-medium">{profile.star_balance}</span>
                  <span className="text-xs text-muted-foreground">Stars</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col space-y-2">
              <Button variant="outline" size="sm">
                <Edit className="w-4 h-4 mr-2" />
                Edit Profile
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* VIP Section */}
      {!profile.vip && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-800 flex items-center">
              <Crown className="w-5 h-5 mr-2" />
              Upgrade to VIP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm space-y-2">
                <p><strong>✅ VIP Badge</strong> - Blue checkmark beside your name</p>
                <p><strong>✅ Priority Posts</strong> - Your posts get highlighted</p>
                <p><strong>✅ Premium Recipes</strong> - VIP-only content access</p>
                <p><strong>✅ Special Discounts</strong> - Lower marketplace fees</p>
                <p><strong>✅ Exclusive Contests</strong> - VIP-only challenges</p>
              </div>
              <Button onClick={handleVipUpgrade} className="w-full bg-yellow-600 hover:bg-yellow-700">
                <Crown className="w-4 h-4 mr-2" />
                Become VIP
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Star Balance Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Star className="w-5 h-5 mr-2 text-yellow-500" />
            Star Balance: {profile.star_balance}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Stars are used to access premium content in private groups and purchase exclusive items.
          </p>
          <Button onClick={handleBuyStars} variant="outline">
            <Star className="w-4 h-4 mr-2" />
            Buy Stars
          </Button>
        </CardContent>
      </Card>

      {/* Tabs for Posts, Groups, etc. */}
      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="posts">My Posts</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="marketplace">Listings</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          <div className="space-y-4">
            {userPosts.length > 0 ? (
              userPosts.map((post: any) => {
                const currentUserLiked = isPostLiked(post.id);
                const likesCount = postLikes[post.id]?.length || 0;

                return (
                  <Card key={post.id} className="overflow-hidden">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold mb-2">{post.title}</h3>
                          <Badge variant="outline" className="text-xs">{post.category}</Badge>
                        </div>
                        <PostMenu 
                          postId={post.id} 
                          postOwnerId={post.user_id}
                          onPostDeleted={fetchUserPosts}
                        />
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-4">
                      <p className="text-sm whitespace-pre-line">{post.body}</p>
                      
                      {post.media_urls && post.media_urls.length > 0 && (
                        <div className="space-y-2">
                          {post.media_urls.map((url: string, index: number) => {
                            const isVideo = url.match(/\.(mp4|webm|ogg)$/i) || url.includes('video');
                            return isVideo ? (
                              <VideoPlayer key={index} src={url} />
                            ) : (
                              <img 
                                key={index}
                                src={url} 
                                alt={`Post media ${index + 1}`}
                                className="w-full rounded-lg max-h-96 object-cover"
                              />
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="flex items-center space-x-4">
                          <button
                            onClick={() => handleLike(post.id)}
                            className={`flex items-center space-x-2 ${
                              currentUserLiked ? 'text-red-500' : 'text-muted-foreground'
                            } hover:text-red-500 transition-colors`}
                          >
                            <Heart className={`h-5 w-5 ${currentUserLiked ? 'fill-current' : ''}`} />
                            <span className="text-sm font-medium">{likesCount}</span>
                          </button>

                          <button
                            onClick={() => setExpandedComments(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
                            className="flex items-center space-x-2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <MessageCircle className="h-5 w-5" />
                            <span className="text-sm">{post.comments_count || 0}</span>
                          </button>
                        </div>

                        <ShareMenu postId={post.id} postTitle={post.title} />
                      </div>

                      {expandedComments[post.id] && (
                        <div className="pt-4 border-t">
                          <CommentSection postId={post.id} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No posts yet</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="groups">
          <Card>
            <CardHeader>
              <CardTitle>My Groups</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Groups feature coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketplace">
          <Card>
            <CardHeader>
              <CardTitle>My Marketplace Listings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {profile.vip ? "No listings yet" : "Upgrade to VIP to access marketplace"}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Account Created</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(profile.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
                {profile.vip && (
                  <div>
                    <p className="text-sm font-medium">VIP Status</p>
                    <p className="text-sm text-muted-foreground">
                      Expires: {new Date(profile.vip_expires_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Profile;