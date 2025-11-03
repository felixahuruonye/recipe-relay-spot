import { useState, useEffect } from 'react';
import { Search, TrendingUp, Sparkles, X, Plus, Flame, Clock, Calendar, Sun, Moon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SearchResult {
  id: string;
  type: 'user' | 'post';
  title: string;
  subtitle?: string;
  avatar_url?: string;
  thumbnail?: string;
  category?: string;
  body?: string;
  created_at?: string;
  view_count?: number;
  likes_count?: number;
}

interface TrendingKeyword {
  keyword: string;
  search_count: number;
  last_search_at: string;
}

export const AdvancedSearchBar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchType, setSearchType] = useState<'all' | 'users' | 'posts' | 'category'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const [trending, setTrending] = useState<TrendingKeyword[]>([]);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [userCredits, setUserCredits] = useState(250);
  const [timeWindow, setTimeWindow] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [showTrendingDialog, setShowTrendingDialog] = useState(false);
  const [viewedPosts, setViewedPosts] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const categories = ['General', 'Tech', 'Sports', 'Entertainment', 'News', 'Other'];

  useEffect(() => {
    loadTrending();
    if (user) {
      loadUserCredits();
      loadViewedPosts();
    }
  }, [user, timeWindow]);

  useEffect(() => {
    if (query.length > 0) {
      searchContent();
      trackSearch();
    } else {
      setResults([]);
      setAiSummary('');
      setIsOpen(false);
    }
  }, [query, searchType, selectedCategory]);

  const loadViewedPosts = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('post_views')
      .select('post_id')
      .eq('user_id', user.id);
    
    if (data) {
      setViewedPosts(data.map(v => v.post_id));
    }
  };

  const loadUserCredits = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('ai_credits')
        .eq('id', user.id)
        .single();
      
      if (data && !error) {
        setUserCredits(data.ai_credits || 0);
      }
    } catch (err) {
      console.error('Error loading credits:', err);
    }
  };

  const getTimeWindowHours = () => {
    switch(timeWindow) {
      case '1h': return 1;
      case '24h': return 24;
      case '7d': return 168;
      case '30d': return 720;
      default: return 24;
    }
  };

  const loadTrending = async () => {
    const hours = getTimeWindowHours();
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const { data } = await supabase
      .from('search_trends')
      .select('*')
      .gte('last_search_at', cutoffTime)
      .order('search_count', { ascending: false })
      .limit(10);
    
    if (data) setTrending(data);
  };

  const trackSearch = async () => {
    if (query.length < 3) return;
    const keyword = query.toLowerCase().trim();
    const { data: existing } = await supabase
      .from('search_trends')
      .select('*')
      .eq('keyword', keyword)
      .single();

    if (existing) {
      await supabase
        .from('search_trends')
        .update({ 
          search_count: existing.search_count + 1,
          last_search_at: new Date().toISOString()
        })
        .eq('keyword', keyword);
    } else {
      await supabase
        .from('search_trends')
        .insert({ keyword, search_count: 1 });
    }
    loadTrending();
  };

  const searchContent = async () => {
    setSearchLoading(true);
    const searchResults: SearchResult[] = [];

    if (searchType === 'all' || searchType === 'users') {
      const { data: users } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${query}%`)
        .limit(5);

      if (users) {
        searchResults.push(...users.map(user => ({
          id: user.id,
          type: 'user' as const,
          title: user.username,
          avatar_url: user.avatar_url || undefined,
        })));
      }
    }

    if (searchType === 'all' || searchType === 'posts') {
      const { data: posts } = await supabase
        .from('posts')
        .select('id, title, category, body, media_urls, created_at, view_count, likes_count')
        .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
        .eq('status', 'approved')
        .limit(10);

      if (posts) {
        searchResults.push(...posts.map(post => ({
          id: post.id,
          type: 'post' as const,
          title: post.title,
          subtitle: post.category,
          category: post.category,
          thumbnail: post.media_urls?.[0],
          body: post.body,
          created_at: post.created_at,
          view_count: post.view_count || 0,
          likes_count: post.likes_count || 0,
        })));
      }
    }

    if (searchType === 'category' && selectedCategory) {
      const { data: posts } = await supabase
        .from('posts')
        .select('id, title, category, body, media_urls, created_at, view_count, likes_count')
        .eq('category', selectedCategory)
        .eq('status', 'approved')
        .limit(10);

      if (posts) {
        searchResults.push(...posts.map(post => ({
          id: post.id,
          type: 'post' as const,
          title: post.title,
          subtitle: post.category,
          thumbnail: post.media_urls?.[0],
          body: post.body,
          created_at: post.created_at,
          view_count: post.view_count || 0,
          likes_count: post.likes_count || 0,
        })));
      }
    }

    setResults(searchResults);
    setIsOpen(true);
    setSearchLoading(false);
  };

  const getAISummary = async () => {
    if (!user) {
      toast({
        title: 'Login Required',
        description: 'Please login to use FlowaIr AI.',
        variant: 'destructive'
      });
      return;
    }

    setLoadingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('flowair-search', {
        body: { query, results, trending, timeWindow: getTimeWindowText() }
      });

      if (error) {
        if (error.message?.includes('Out of AI credits') || error.message?.includes('402')) {
          toast({
            title: 'Out of Credits',
            description: 'Earn or buy Stars to use FlowaIr AI (100 Stars = 250 credits).',
            variant: 'destructive'
          });
        } else {
          throw error;
        }
        return;
      }

      if (data?.aiResponse) {
        setAiSummary(data.aiResponse);
        if (data?.creditsRemaining !== undefined) {
          setUserCredits(data.creditsRemaining);
        }
        toast({ 
          title: '✨ FlowaIr Insights', 
          description: `Credits remaining: ${data.creditsRemaining || userCredits - 1}`
        });
      }
    } catch (error) {
      console.error('AI Error:', error);
      toast({
        title: 'FlowaIr is resting 💤',
        description: 'Try again in a moment.',
        variant: 'destructive'
      });
    } finally {
      setLoadingAI(false);
    }
  };

  const getTimeWindowText = () => {
    switch(timeWindow) {
      case '1h': return '1 hour';
      case '24h': return '24 hours';
      case '7d': return '7 days';
      case '30d': return '30 days';
      default: return '24 hours';
    }
  };

  const getTimeWindowIcon = () => {
    switch(timeWindow) {
      case '1h': return <Clock className="h-3 w-3" />;
      case '24h': return <Sun className="h-3 w-3" />;
      case '7d': return <Calendar className="h-3 w-3" />;
      case '30d': return <Moon className="h-3 w-3" />;
    }
  };

  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'user') {
      navigate(`/profile/${result.id}`);
    } else {
      const postElement = document.getElementById(`post-${result.id}`);
      if (postElement) {
        postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    setIsOpen(false);
    setQuery('');
  };

  const handleTrendClick = (keyword: string) => {
    setQuery(keyword);
  };

  const handleCreatePostFromTrend = (keyword: string) => {
    // Store the trend keyword for prefilling create post
    sessionStorage.setItem('createPostPrefill', JSON.stringify({
      title: keyword,
      category: 'General'
    }));
    navigate('/');
    // Trigger create post dialog after short delay
    setTimeout(() => {
      const createBtn = document.querySelector('[data-create-post-trigger]');
      if (createBtn instanceof HTMLElement) {
        createBtn.click();
      }
    }, 300);
  };

  const getTimeSince = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const isMediaVideo = (url: string) => {
    return url?.match(/\.(mp4|webm|ogg|mov)$/i);
  };

  const newResults = results.filter(r => r.type === 'user' || !viewedPosts.includes(r.id));
  const viewedResults = results.filter(r => r.type === 'post' && viewedPosts.includes(r.id));

  return (
    <div className="relative w-full mb-6">
      <Card className="glass-card p-4 border-primary/20">
        <div className="flex flex-col space-y-3">
          {/* Search Input Row */}
          <div className="flex gap-2">
            <Select value={searchType} onValueChange={(val: any) => setSearchType(val)}>
              <SelectTrigger className="w-32 btn-3d">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="users">Users</SelectItem>
                <SelectItem value="posts">Posts</SelectItem>
                <SelectItem value="category">Category</SelectItem>
              </SelectContent>
            </Select>

            {searchType === 'category' && (
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-40 btn-3d">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search posts, users, or ask FlowaIr..."
                className="pl-10 pr-10 btn-3d"
              />
              {query && (
                <X 
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground"
                  onClick={() => {
                    setQuery('');
                    setAiSummary('');
                  }}
                />
              )}
            </div>

            <Button size="icon" onClick={getAISummary} disabled={loadingAI} className="btn-3d bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>

          {/* Trending Section with Time Windows */}
          {!query && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500 animate-pulse" />
                  <span className="text-sm font-semibold">Trending Now</span>
                </div>
                <div className="flex gap-1">
                  {(['1h', '24h', '7d', '30d'] as const).map((tw) => (
                    <Button
                      key={tw}
                      size="sm"
                      variant={timeWindow === tw ? 'default' : 'outline'}
                      className="h-7 text-xs px-2"
                      onClick={() => setTimeWindow(tw)}
                    >
                      {tw === '1h' && <Clock className="h-3 w-3 mr-1" />}
                      {tw === '24h' && <Sun className="h-3 w-3 mr-1" />}
                      {tw === '7d' && <Calendar className="h-3 w-3 mr-1" />}
                      {tw === '30d' && <Moon className="h-3 w-3 mr-1" />}
                      {tw}
                    </Button>
                  ))}
                  {trending.length > 5 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2"
                      onClick={() => setShowTrendingDialog(true)}
                    >
                      View All
                    </Button>
                  )}
                </div>
              </div>
              
              {trending.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {trending.slice(0, 5).map((trend, idx) => (
                    <div key={trend.keyword} className="flex items-center gap-1 group">
                      <Badge 
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary/20 transition-all hover:scale-105"
                        onClick={() => handleTrendClick(trend.keyword)}
                      >
                        🔥 {trend.keyword} ({trend.search_count})
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleCreatePostFromTrend(trend.keyword)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No trending searches in this time window</p>
              )}
            </div>
          )}

          {/* AI Credits Display */}
          {user && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>FlowaIr Credits: <span className="font-bold text-primary">{userCredits}</span></span>
              <span className="text-[10px]">Trending: {getTimeWindowText()}</span>
            </div>
          )}
        </div>
      </Card>

      {/* AI Summary */}
      {aiSummary && (
        <Card className="mt-2 glass-card border-primary/50 animate-in slide-in-from-top">
          <div className="p-4 space-y-2">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              <span className="font-semibold gradient-text">FlowaIr Summary</span>
            </div>
            <p className="text-sm whitespace-pre-line">{aiSummary}</p>
          </div>
        </Card>
      )}

      {/* Search Results with Tabs */}
      {isOpen && results.length > 0 && (
        <Card className="absolute z-50 w-full mt-2 glass-card border shadow-xl animate-in slide-in-from-top">
          <Tabs defaultValue="new" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="new">
                🆕 New ({newResults.length})
              </TabsTrigger>
              <TabsTrigger value="viewed">
                🕓 Viewed ({viewedResults.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="new" className="max-h-96 overflow-y-auto p-2">
              {searchLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex gap-3 p-3">
                      <Skeleton className="w-16 h-16 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : newResults.length > 0 ? (
                newResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    className="w-full flex items-start gap-3 p-3 hover:bg-accent rounded-lg transition-colors text-left group"
                  >
                    {result.type === 'user' ? (
                      <>
                        <Avatar className="h-12 w-12 border-2 border-primary/20">
                          <AvatarImage src={result.avatar_url} />
                          <AvatarFallback>{result.title[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium group-hover:text-primary transition-colors">{result.title}</p>
                          <p className="text-xs text-muted-foreground">User Profile</p>
                        </div>
                      </>
                    ) : (
                      <>
                        {result.thumbnail && (
                          <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border border-primary/20">
                            {isMediaVideo(result.thumbnail) ? (
                              <video 
                                src={result.thumbnail}
                                className="w-full h-full object-cover"
                                muted
                              />
                            ) : (
                              <img 
                                src={result.thumbnail} 
                                alt={result.title}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium group-hover:text-primary transition-colors line-clamp-1">{result.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {result.subtitle}
                            </Badge>
                            {result.created_at && (
                              <span className="text-[10px] text-muted-foreground">
                                {getTimeSince(result.created_at)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{result.body}</p>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                            <span>👁️ {result.view_count || 0}</span>
                            <span>❤️ {result.likes_count || 0}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </button>
                ))
              ) : (
                <div className="p-6 text-center">
                  <p className="text-muted-foreground">No new posts found</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="viewed" className="max-h-96 overflow-y-auto p-2">
              {viewedResults.length > 0 ? (
                viewedResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    className="w-full flex items-start gap-3 p-3 hover:bg-accent rounded-lg transition-colors text-left opacity-70 hover:opacity-100"
                  >
                    {result.thumbnail && (
                      <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border border-primary/20">
                        {isMediaVideo(result.thumbnail) ? (
                          <video 
                            src={result.thumbnail}
                            className="w-full h-full object-cover"
                            muted
                          />
                        ) : (
                          <img 
                            src={result.thumbnail} 
                            alt={result.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium line-clamp-1">{result.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {result.subtitle}
                        </Badge>
                        {result.created_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {getTimeSince(result.created_at)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{result.body}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-6 text-center">
                  <p className="text-muted-foreground">No viewed posts found</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      )}

      {/* No Results */}
      {isOpen && results.length === 0 && query.length > 0 && !searchLoading && (
        <Card className="absolute z-50 w-full mt-2 glass-card">
          <div className="p-6 text-center space-y-3">
            <p className="text-muted-foreground">No results found for "{query}"</p>
            <p className="text-xs text-muted-foreground">Be the first to post about this topic!</p>
            <Button 
              size="sm"
              onClick={() => handleCreatePostFromTrend(query)}
              className="mx-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Post
            </Button>
          </div>
        </Card>
      )}

      {/* Trending Dialog */}
      <Dialog open={showTrendingDialog} onOpenChange={setShowTrendingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500 animate-pulse" />
              All Trending Topics - {getTimeWindowText()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {trending.map((trend, idx) => (
              <div key={trend.keyword} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors group">
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-lg font-bold text-muted-foreground">#{idx + 1}</span>
                  <div className="flex-1">
                    <p className="font-medium">{trend.keyword}</p>
                    <p className="text-xs text-muted-foreground">
                      {trend.search_count} searches
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      handleTrendClick(trend.keyword);
                      setShowTrendingDialog(false);
                    }}
                  >
                    Search
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => {
                      handleCreatePostFromTrend(trend.keyword);
                      setShowTrendingDialog(false);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};