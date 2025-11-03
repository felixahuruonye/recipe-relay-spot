import { useState, useEffect } from 'react';
import { Search, TrendingUp, Sparkles, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

interface SearchResult {
  id: string;
  type: 'user' | 'post';
  title: string;
  subtitle?: string;
  avatar_url?: string;
  thumbnail?: string;
  category?: string;
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

  const categories = ['General', 'Tech', 'Sports', 'Entertainment', 'News', 'Other'];

  useEffect(() => {
    loadTrending();
    if (user) {
      loadUserCredits();
    }
  }, [user]);

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

  const loadTrending = async () => {
    const { data } = await supabase
      .from('search_trends')
      .select('*')
      .order('search_count', { ascending: false })
      .limit(5);
    
    if (data) setTrending(data);
  };

  const trackSearch = async () => {
    if (query.length < 3) return;
    // Track search trend
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
        .select('id, title, category, body, media_urls')
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
        })));
      }
    }

    if (searchType === 'category' && selectedCategory) {
      const { data: posts } = await supabase
        .from('posts')
        .select('id, title, category, body, media_urls')
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
        })));
      }
    }

    setResults(searchResults);
    setIsOpen(true);
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
      // Get current session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: 'Session Expired',
          description: 'Please login again.',
          variant: 'destructive'
        });
        return;
      }

      // Call AI edge function (it will handle credit checking and deduction)
      const { data, error } = await supabase.functions.invoke('flowair-search', {
        body: { query, results, trending }
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
        // Update displayed credits count
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

  return (
    <div className="relative w-full mb-6">
      <Card className="glass-card p-4">
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
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer"
                  onClick={() => {
                    setQuery('');
                    setAiSummary('');
                  }}
                />
              )}
            </div>

            <Button size="icon" onClick={getAISummary} disabled={loadingAI} className="btn-3d">
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>

          {/* Trending Section */}
          {trending.length > 0 && !query && (
            <div className="flex flex-wrap items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Trending:</span>
              {trending.slice(0, 5).map((trend) => (
                <Badge 
                  key={trend.keyword}
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary/20 transition-colors"
                  onClick={() => handleTrendClick(trend.keyword)}
                >
                  🔥 {trend.keyword}
                </Badge>
              ))}
            </div>
          )}

          {/* AI Credits Display */}
          {user && (
            <div className="text-xs text-muted-foreground text-right">
              FlowaIr Credits: {userCredits}
            </div>
          )}
        </div>
      </Card>

      {/* AI Summary */}
      {aiSummary && (
        <Card className="mt-2 glass-card border-primary/50">
          <div className="p-4 space-y-2">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-semibold gradient-text">FlowaIr Summary</span>
            </div>
            <p className="text-sm whitespace-pre-line">{aiSummary}</p>
          </div>
        </Card>
      )}

      {/* Search Results */}
      {isOpen && results.length > 0 && (
        <Card className="absolute z-50 w-full mt-2 max-h-96 overflow-y-auto glass-card border shadow-lg">
          <div className="p-2">
            {results.map((result) => (
              <button
                key={result.id}
                onClick={() => handleResultClick(result)}
                className="w-full flex items-center gap-3 p-3 hover:bg-accent rounded-lg transition-colors text-left"
              >
                {result.type === 'user' ? (
                  <>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={result.avatar_url} />
                      <AvatarFallback>{result.title[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{result.title}</p>
                      <p className="text-sm text-muted-foreground">User Profile</p>
                    </div>
                  </>
                ) : (
                  <>
                    {result.thumbnail && (
                      <img 
                        src={result.thumbnail} 
                        alt={result.title}
                        className="w-16 h-16 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{result.title}</p>
                      <p className="text-sm text-muted-foreground">{result.subtitle}</p>
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* No Results */}
      {isOpen && results.length === 0 && query.length > 0 && (
        <Card className="absolute z-50 w-full mt-2 glass-card">
          <div className="p-6 text-center">
            <p className="text-muted-foreground mb-4">No results found for "{query}"</p>
            <p className="text-xs text-muted-foreground mt-2">Try different keywords or browse the feed</p>
          </div>
        </Card>
      )}
    </div>
  );
};