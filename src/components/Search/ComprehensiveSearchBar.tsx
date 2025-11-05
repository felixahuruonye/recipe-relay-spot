import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, TrendingUp, Flame, Mic, Bookmark, Plus, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';

const CATEGORIES = [
  "All",
  "Food & Cooking",
  "Jollof Rice",
  "Desserts",
  "Equipment",
  "For Sale",
  "Tips & Tricks",
  "Restaurant Reviews",
  "Recipes",
  "Cooking Videos",
  "General Discussion"
];

export const ComprehensiveSearchBar = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [results, setResults] = useState<any[]>([]);
  const [newPosts, setNewPosts] = useState<any[]>([]);
  const [viewedPosts, setViewedPosts] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [hotTopics, setHotTopics] = useState<any[]>([]);
  const [flowaIrResponse, setFlowaIrResponse] = useState('');
  const [savedSearches, setSavedSearches] = useState<string[]>([]);
  const [showTrendingDialog, setShowTrendingDialog] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceCredits, setVoiceCredits] = useState(50);

  useEffect(() => {
    loadTrending();
    loadHotTopics();
    loadSavedSearches();
    loadVoiceCredits();
  }, []);

  useEffect(() => {
    if (query.length >= 2 || category !== 'All') {
      const debounce = setTimeout(() => {
        performSearch();
      }, 300);
      return () => clearTimeout(debounce);
    } else {
      setResults([]);
      setNewPosts([]);
      setViewedPosts([]);
      setFlowaIrResponse('');
    }
  }, [query, category]);

  const loadVoiceCredits = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('voice_credits')
      .eq('id', user.id)
      .single();
    if (data) setVoiceCredits(data.voice_credits || 0);
  };

  const loadTrending = async () => {
    const now = new Date();
    const oneHour = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { data } = await supabase
      .from('search_trends')
      .select('*')
      .order('search_count', { ascending: false })
      .limit(20);

    if (data) setTrending(data);
  };

  const loadHotTopics = async () => {
    const { data } = await supabase
      .from('hot_topics')
      .select('*, posts(*)')
      .order('reactions_count', { ascending: false })
      .limit(10);

    if (data) setHotTopics(data);
  };

  const loadSavedSearches = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('saved_searches')
      .select('query')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) setSavedSearches(data.map(s => s.query));
  };

  const performSearch = async () => {
    setIsSearching(true);
    try {
      // Track search
      await supabase.rpc('track_search', { search_keyword: query });

      let searchQuery = supabase
        .from('posts')
        .select('*, user_profiles(username, avatar_url)')
        .eq('status', 'approved')
        .or(`title.ilike.%${query}%,body.ilike.%${query}%,category.ilike.%${query}%`);

      if (category !== 'All') {
        searchQuery = searchQuery.eq('category', category);
      }

      const { data } = await searchQuery.limit(50);

      if (data) {
        setResults(data);
        
        // Separate into new and viewed
        const newResults = data.filter(p => p.post_status === 'new');
        const viewedResults = data.filter(p => p.post_status === 'viewed');
        setNewPosts(newResults);
        setViewedPosts(viewedResults);

        // Call FlowaIr if user has credits
        if (user) {
          callFlowaIr(query, data);
        }
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const callFlowaIr = async (searchQuery: string, posts: any[]) => {
    try {
      const { data, error } = await supabase.functions.invoke('flowair-search', {
        body: { query: searchQuery, posts, context: 'search' }
      });

      if (error) throw error;
      if (data?.response) {
        setFlowaIrResponse(data.response);
      }
    } catch (error: any) {
      console.error('FlowaIr error:', error);
      if (error?.message?.includes('credits')) {
        toast({
          title: "Out of AI Credits",
          description: error.message,
          variant: "destructive"
        });
      }
    }
  };

  const handleVoiceSearch = async () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: "Not Supported",
        description: "Voice search is not supported in this browser",
        variant: "destructive"
      });
      return;
    }

    if (voiceCredits <= 0) {
      toast({
        title: "No Voice Credits",
        description: "You need 300 stars to recharge 50 voice credits",
        variant: "destructive"
      });
      return;
    }

    setIsListening(true);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);

      // Deduct voice credit
      const { data } = await supabase.rpc('deduct_voice_credits', { p_user_id: user.id });
      const result = data as any;
      if (result?.success) {
        setVoiceCredits(result.credits);
        if (result.recharged) {
          toast({
            title: "Credits Recharged",
            description: "300 stars deducted, 50 voice credits added"
          });
        }
      }
    };

    recognition.onerror = () => {
      toast({
        title: "Voice Error",
        description: "Could not recognize speech",
        variant: "destructive"
      });
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const saveSearch = async (searchQuery: string) => {
    if (!user) return;
    await supabase.from('saved_searches').insert({
      user_id: user.id,
      query: searchQuery
    });
    loadSavedSearches();
    toast({ title: "Search Saved", description: "Added to your saved searches" });
  };

  const openPost = (post: any) => {
    navigate(`/?post=${post.id}`);
  };

  const openCreatePost = () => {
    navigate('/?create=true');
  };

  return (
    <div className="w-full space-y-4">
      {/* Search Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts, stories, trends..."
            className="pl-10 pr-20"
            onKeyDown={(e) => {
              if (e.key === 'Enter') performSearch();
            }}
          />
          {query && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-12 top-1"
              onClick={() => setQuery('')}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant={isListening ? "default" : "ghost"}
            className="absolute right-1 top-1"
            onClick={handleVoiceSearch}
          >
            <Mic className={`w-4 h-4 ${isListening ? 'animate-pulse' : ''}`} />
          </Button>
        </div>
        
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={performSearch} disabled={isSearching} className="gap-2">
          {isSearching ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {/* Voice Credits Indicator */}
      {user && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mic className="w-3 h-3" />
          <span>{voiceCredits} voice credits remaining</span>
        </div>
      )}

      {/* Trending Section */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => setShowTrendingDialog(true)}>
          <TrendingUp className="w-4 h-4 mr-2" />
          View All Trending
        </Button>
        
        {trending.slice(0, 5).map((trend) => (
          <Badge
            key={trend.id}
            variant="secondary"
            className="cursor-pointer hover:bg-primary/20"
            onClick={() => setQuery(trend.keyword)}
          >
            <Flame className="w-3 h-3 mr-1" />
            {trend.keyword}
          </Badge>
        ))}
      </div>

      {/* Saved Searches */}
      {savedSearches.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Bookmark className="w-3 h-3" />
            Saved:
          </span>
          {savedSearches.map((search, i) => (
            <Badge
              key={i}
              variant="outline"
              className="cursor-pointer"
              onClick={() => setQuery(search)}
            >
              {search}
            </Badge>
          ))}
        </div>
      )}

      {/* Search Results */}
      {(newPosts.length > 0 || viewedPosts.length > 0) && (
        <div className="space-y-4">
          {/* FlowaIr Response */}
          {flowaIrResponse && (
            <Card className="glass-card border-primary/30">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold">AI</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">FlowaIr Answers</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{flowaIrResponse}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="new">
            <TabsList className="w-full">
              <TabsTrigger value="new" className="flex-1">
                🆕 New Posts ({newPosts.length})
              </TabsTrigger>
              <TabsTrigger value="viewed" className="flex-1">
                🕓 Viewed Posts ({viewedPosts.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="space-y-2">
              {newPosts.map((post) => (
                <Card key={post.id} className="cursor-pointer hover:border-primary/50" onClick={() => openPost(post)}>
                  <CardContent className="p-4 flex gap-3">
                    {post.media_urls?.[0] && (
                      <div className="w-20 h-20 rounded overflow-hidden flex-shrink-0">
                        {post.media_urls[0].includes('video') ? (
                          <video src={post.media_urls[0]} className="w-full h-full object-cover" />
                        ) : (
                          <img src={post.media_urls[0]} className="w-full h-full object-cover" />
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{post.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{post.body}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary">{post.category}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(post.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="viewed" className="space-y-2">
              {viewedPosts.map((post) => (
                <Card key={post.id} className="cursor-pointer hover:border-primary/50" onClick={() => openPost(post)}>
                  <CardContent className="p-4 flex gap-3">
                    {post.media_urls?.[0] && (
                      <div className="w-20 h-20 rounded overflow-hidden flex-shrink-0">
                        {post.media_urls[0].includes('video') ? (
                          <video src={post.media_urls[0]} className="w-full h-full object-cover" />
                        ) : (
                          <img src={post.media_urls[0]} className="w-full h-full object-cover" />
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{post.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{post.body}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary">{post.category}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(post.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>

          {results.length === 0 && query.length >= 2 && !isSearching && (
            <Card>
              <CardContent className="pt-6 text-center space-y-4">
                <p className="text-muted-foreground">No posts found yet. Be the first to post about this!</p>
                <Button onClick={openCreatePost}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Post
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Trending Dialog */}
      <Dialog open={showTrendingDialog} onOpenChange={setShowTrendingDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trending Now</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="1h">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="1h">1 Hour</TabsTrigger>
              <TabsTrigger value="24h">24 Hours</TabsTrigger>
              <TabsTrigger value="7d">7 Days</TabsTrigger>
              <TabsTrigger value="30d">30 Days</TabsTrigger>
            </TabsList>

            {['1h', '24h', '7d', '30d'].map((period) => (
              <TabsContent key={period} value={period} className="space-y-2">
                {trending.map((trend, index) => (
                  <Card key={trend.id} className="cursor-pointer hover:border-primary/50">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold text-muted-foreground">#{index + 1}</span>
                        <div>
                          <p className="font-semibold">{trend.keyword}</p>
                          <p className="text-xs text-muted-foreground">{trend.search_count} searches</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          setQuery(trend.keyword);
                          setShowTrendingDialog(false);
                        }}>
                          Search
                        </Button>
                        <Button size="sm" onClick={() => {
                          navigate(`/?create=true&title=${encodeURIComponent(trend.keyword)}`);
                          setShowTrendingDialog(false);
                        }}>
                          <Plus className="w-4 h-4 mr-1" />
                          Create Post
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            ))}
          </Tabs>

          {/* Hot Topics Section */}
          {hotTopics.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                Hot Topics
              </h3>
              <div className="space-y-2">
                {hotTopics.map((topic) => (
                  <Card key={topic.id} className="cursor-pointer hover:border-primary/50" onClick={() => openPost(topic.posts)}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{topic.posts?.title}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span>{topic.views_count} views</span>
                            <span>{topic.reactions_count} reactions</span>
                          </div>
                        </div>
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <Flame className="w-3 h-3" />
                          Hot
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
