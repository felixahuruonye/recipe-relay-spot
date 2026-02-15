import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TrendingUp, Flame, Clock, Calendar, Eye, Heart, Plus, Users, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface TrendingPost {
  id: string;
  title: string;
  body: string;
  category: string;
  media_urls: string[];
  view_count: number;
  likes_count: number;
  comments_count: number;
  created_at: string;
  user_id: string;
}

interface TrendingKeyword {
  id: string;
  keyword: string;
  search_count: number;
  last_search_at: string;
}

interface TopCreator {
  id: string;
  username: string;
  avatar_url: string | null;
  vip: boolean | null;
  post_count: number | null;
  follower_count: number | null;
}

const Explore = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [hotTopics, setHotTopics] = useState<TrendingPost[]>([]);
  const [trendingKeywords, setTrendingKeywords] = useState<TrendingKeyword[]>([]);
  const [topCreators, setTopCreators] = useState<TopCreator[]>([]);
  const [recentPosts, setRecentPosts] = useState<(TrendingPost & { user_profiles?: any })[]>([]);
  const [timeWindow, setTimeWindow] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrendingData();
  }, [timeWindow]);

  const fetchTrendingData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      let threshold = new Date();
      switch (timeWindow) {
        case '1h': threshold = new Date(now.getTime() - 60 * 60 * 1000); break;
        case '24h': threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
        case '7d': threshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
        case '30d': threshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      }

      // Fetch hot topics (posts with high engagement)
      const { data: posts } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'approved')
        .gte('created_at', threshold.toISOString())
        .order('view_count', { ascending: false })
        .limit(20);

      // Also fetch popular posts (lower threshold for actual content)
      const hotPosts = (posts || []).filter(p => (p.view_count || 0) >= 5 || (p.likes_count || 0) >= 2);
      setHotTopics(hotPosts.length > 0 ? hotPosts : (posts || []).slice(0, 10));

      // Fetch trending keywords
      const { data: keywords } = await supabase
        .from('search_trends')
        .select('*')
        .gte('search_count', 1)
        .gte('last_search_at', threshold.toISOString())
        .order('search_count', { ascending: false })
        .limit(15);

      setTrendingKeywords(keywords || []);

      // Fetch top creators
      const { data: creators } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url, vip, post_count, follower_count')
        .order('follower_count', { ascending: false })
        .limit(10);

      setTopCreators(creators || []);

      // Fetch recent popular posts with user profiles
      const { data: recent } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(15);

      if (recent && recent.length > 0) {
        const userIds = [...new Set(recent.map(p => p.user_id))];
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, username, avatar_url, vip')
          .in('id', userIds);
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        setRecentPosts(recent.map(p => ({ ...p, user_profiles: profileMap.get(p.user_id) })));
      }
    } catch (error) {
      console.error('Error fetching trending data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = (keyword: string) => {
    navigate(`/feed?createPost=true&title=${encodeURIComponent(keyword)}`);
  };

  const handleKeywordClick = (keyword: string) => {
    navigate(`/?search=${encodeURIComponent(keyword)}`);
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-primary">🔥 Explore</h1>
        <p className="text-muted-foreground">Discover what's trending in the community</p>
      </div>

      {/* Time Window */}
      <div className="flex justify-center gap-2 flex-wrap">
        {[
          { key: '1h' as const, icon: Clock, label: '1 Hour' },
          { key: '24h' as const, icon: Flame, label: '24 Hours' },
          { key: '7d' as const, icon: TrendingUp, label: '7 Days' },
          { key: '30d' as const, icon: Calendar, label: '30 Days' },
        ].map(tw => (
          <Button key={tw.key} variant={timeWindow === tw.key ? 'default' : 'outline'} size="sm" onClick={() => setTimeWindow(tw.key)}>
            <tw.icon className="h-4 w-4 mr-2" />{tw.label}
          </Button>
        ))}
      </div>

      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="posts">🔥 Hot</TabsTrigger>
          <TabsTrigger value="creators">👑 Creators</TabsTrigger>
          <TabsTrigger value="keywords">🔍 Trending</TabsTrigger>
        </TabsList>

        {/* Hot Posts */}
        <TabsContent value="posts" className="space-y-4">
          {loading ? (
            <div className="grid gap-4">
              {[...Array(5)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="h-16 bg-muted" />
                  <CardContent className="h-20 bg-muted mt-2" />
                </Card>
              ))}
            </div>
          ) : hotTopics.length > 0 ? (
            <div className="grid gap-4">
              {hotTopics.map((post, index) => {
                const hasMedia = post.media_urls && post.media_urls.length > 0;
                return (
                  <Card
                    key={post.id}
                    className="hover:shadow-lg transition-all cursor-pointer"
                    onClick={() => navigate(`/?post=${post.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        {hasMedia && (
                          <img src={post.media_urls[0]} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="default" className="text-xs">#{index + 1}</Badge>
                            <Badge variant="outline" className="text-xs">{post.category}</Badge>
                          </div>
                          <h3 className="font-semibold text-sm line-clamp-2">{post.title}</h3>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{post.body}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.view_count || 0}</span>
                            <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{post.likes_count || 0}</span>
                            <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{post.comments_count || 0}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Flame className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No hot topics in this time window yet. Start posting!</p>
              </CardContent>
            </Card>
          )}

          {/* Recent Posts Section */}
          {recentPosts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5" /> Recent Posts
              </h2>
              {recentPosts.slice(0, 8).map(post => (
                <Card key={post.id} className="hover:shadow-md transition-all cursor-pointer" onClick={() => navigate(`/?post=${post.id}`)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <Avatar className="w-8 h-8" onClick={e => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}>
                      <AvatarImage src={post.user_profiles?.avatar_url || ''} />
                      <AvatarFallback>{post.user_profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{post.title}</p>
                      <p className="text-xs text-muted-foreground">{post.user_profiles?.username} · {new Date(post.created_at).toLocaleDateString()}</p>
                    </div>
                    {post.media_urls?.[0] && (
                      <img src={post.media_urls[0]} alt="" className="w-12 h-12 rounded object-cover" />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Top Creators */}
        <TabsContent value="creators" className="space-y-4">
          {topCreators.length > 0 ? (
            <div className="grid gap-3">
              {topCreators.map((creator, index) => (
                <Card
                  key={creator.id}
                  className="hover:shadow-md transition-all cursor-pointer"
                  onClick={() => navigate(`/profile/${creator.id}`)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {index + 1}
                    </div>
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={creator.avatar_url || ''} />
                      <AvatarFallback>{creator.username[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{creator.username}</span>
                        {creator.vip && <Badge variant="secondary" className="text-xs bg-yellow-400 text-black">VIP</Badge>}
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                        <span>{creator.follower_count || 0} followers</span>
                        <span>{creator.post_count || 0} posts</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No creators yet. Be the first!</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Trending Keywords */}
        <TabsContent value="keywords" className="space-y-4">
          {trendingKeywords.length > 0 ? (
            <div className="grid gap-2">
              {trendingKeywords.map((item, index) => (
                <Card key={item.id} className="hover:shadow-md transition-all">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => handleKeywordClick(item.keyword)}>
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{item.keyword}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{item.search_count} searches</p>
                          {item.search_count >= 10 && <Badge variant="destructive" className="text-xs">🔥 Hot</Badge>}
                          {item.search_count >= 3 && item.search_count < 10 && <Badge variant="secondary" className="text-xs">📈 Trending</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Flame className="h-5 w-5 text-orange-500" />
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleCreatePost(item.keyword); }}>
                        <Plus className="h-4 w-4 mr-1" />Post
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No trending searches yet. Search to make keywords trend!</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Explore;
