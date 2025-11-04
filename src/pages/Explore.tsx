import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Flame, Clock, Calendar, Eye, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

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
  keyword: string;
  search_count: number;
  last_search_at: string;
}

const Explore = () => {
  const navigate = useNavigate();
  const [hotTopics, setHotTopics] = useState<TrendingPost[]>([]);
  const [trendingKeywords, setTrendingKeywords] = useState<TrendingKeyword[]>([]);
  const [timeWindow, setTimeWindow] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrendingData();
  }, [timeWindow]);

  const fetchTrendingData = async () => {
    setLoading(true);
    try {
      // Calculate time threshold
      const now = new Date();
      let threshold = new Date();
      switch (timeWindow) {
        case '1h':
          threshold = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          threshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          threshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      // Fetch hot topics (posts with 100+ views or 100+ reactions)
      const { data: posts } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'approved')
        .gte('created_at', threshold.toISOString())
        .or(`view_count.gte.100,likes_count.gte.100`)
        .order('view_count', { ascending: false })
        .limit(20);

      setHotTopics(posts || []);

      // Fetch trending keywords
      const { data: keywords } = await supabase
        .from('search_trends')
        .select('*')
        .gte('last_search_at', threshold.toISOString())
        .order('search_count', { ascending: false })
        .limit(10);

      setTrendingKeywords(keywords || []);
    } catch (error) {
      console.error('Error fetching trending data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeIcon = () => {
    switch (timeWindow) {
      case '1h':
        return <Clock className="h-4 w-4" />;
      case '24h':
        return <Flame className="h-4 w-4" />;
      case '7d':
        return <TrendingUp className="h-4 w-4" />;
      case '30d':
        return <Calendar className="h-4 w-4" />;
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold gradient-text">🔥 Explore Trending</h1>
        <p className="text-muted-foreground">
          Discover what's hot in the SaveMore Community
        </p>
      </div>

      {/* Time Window Selector */}
      <div className="flex justify-center gap-2 flex-wrap">
        <Button
          variant={timeWindow === '1h' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTimeWindow('1h')}
        >
          <Clock className="h-4 w-4 mr-2" />
          1 Hour
        </Button>
        <Button
          variant={timeWindow === '24h' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTimeWindow('24h')}
        >
          <Flame className="h-4 w-4 mr-2" />
          24 Hours
        </Button>
        <Button
          variant={timeWindow === '7d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTimeWindow('7d')}
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          7 Days
        </Button>
        <Button
          variant={timeWindow === '30d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTimeWindow('30d')}
        >
          <Calendar className="h-4 w-4 mr-2" />
          30 Days
        </Button>
      </div>

      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="posts">🔥 Hot Topics</TabsTrigger>
          <TabsTrigger value="keywords">🔍 Trending Searches</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4">
          {loading ? (
            <div className="grid gap-4">
              {[...Array(5)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="h-20 bg-muted" />
                  <CardContent className="h-32 bg-muted mt-2" />
                </Card>
              ))}
            </div>
          ) : hotTopics.length > 0 ? (
            <div className="grid gap-4">
              {hotTopics.map((post, index) => (
                <Card 
                  key={post.id} 
                  className="hover:shadow-lg transition-all cursor-pointer glass-card"
                  onClick={() => navigate(`/`)} // Navigate to feed where post is shown
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="default" className="neon-glow">
                            #{index + 1} Hot Topic
                          </Badge>
                          <Badge variant="outline">{post.category}</Badge>
                        </div>
                        <CardTitle className="text-lg">{post.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {post.body}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        <span>{post.view_count} views</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Heart className="h-4 w-4" />
                        <span>{post.likes_count} likes</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Flame className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No hot topics in this time window yet.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="keywords" className="space-y-4">
          {loading ? (
            <div className="grid gap-2">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : trendingKeywords.length > 0 ? (
            <div className="grid gap-2">
              {trendingKeywords.map((item, index) => (
                <Card 
                  key={item.keyword}
                  className="hover:shadow-md transition-all cursor-pointer"
                  onClick={() => navigate(`/?search=${encodeURIComponent(item.keyword)}`)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{item.keyword}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.search_count} searches
                        </p>
                      </div>
                    </div>
                    <Flame className="h-5 w-5 text-orange-500" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No trending searches in this time window yet.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Explore;
