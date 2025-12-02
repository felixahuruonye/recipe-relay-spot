import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X, Mic, Bookmark, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TrendingNow from './TrendingNow';
import SearchResults from './SearchResults';
import FlowaIr from './FlowaIr';

const NewSearchBar = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [showTrending, setShowTrending] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [flowaIrResponse, setFlowaIrResponse] = useState<any>(null);
  const [trending, setTrending] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [hotTopics, setHotTopics] = useState<any[]>([]);

  useEffect(() => {
    loadTrending();
    loadHotTopics();
  }, []);

  useEffect(() => {
    if (query.length >= 2 || category !== 'All') {
      const debounce = setTimeout(() => {
        performSearch();
      }, 300);
      return () => clearTimeout(debounce);
    } else {
      setSearchResults([]);
    }
  }, [query, category]);

  const loadTrending = async () => {
    const { data } = await supabase
      .from('search_trends')
      .select('keyword')
      .order('search_count', { ascending: false })
      .limit(10);

    if (data) setTrending(data);
  };

  const loadHotTopics = async () => {
    const { data } = await supabase.from('hot_topics').select('*');
    if (data) setHotTopics(data);
  };

  const performSearch = async () => {
    setIsSearching(true);
    const q = query.trim();
    if (q.length < 2 && category === 'All') {
      setIsSearching(false);
      return;
    }

    try {
      await supabase.rpc('track_search', { search_keyword: q || category });

      let allResults: any[] = [];

      if (category === 'All' || category === 'Posts') {
        let postsQuery = supabase.from('posts').select('*, view_count, likes_count');
        if (q.length > 0) {
          postsQuery = postsQuery.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
        }
        const { data: posts } = await postsQuery.limit(10);
        if (posts) {
          const trendingKeywords = trending.map((t: any) => t.keyword);
          allResults = allResults.concat(
            posts.map(p => ({
              ...p,
              type: 'post',
              is_trending: trendingKeywords.some((k: string) =>
                p.title.toLowerCase().includes(k.toLowerCase())
              ),
              is_new: new Date(p.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000),
              is_hot_topic: hotTopics.some((ht: any) => ht.post_id === p.id),
            }))
          );
        }
      }

      if (category === 'All' || category === 'Users') {
        if (q.length > 0) {
          const { data: users } = await supabase
            .from('user_profiles')
            .select('id, username, avatar_url')
            .ilike('username', `%${q}%`)
            .limit(5);
          if (users) {
            allResults = allResults.concat(users.map(u => ({ ...u, type: 'user' })));
          }
        }
      }

      setSearchResults(allResults);
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: 'Search Error',
        description: 'Failed to fetch search results. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const saveSearch = async () => {
    if (!user || !query) return;
    await supabase.from('saved_searches').insert({
      user_id: user.id,
      query: query,
    });
    toast({ title: 'Search Saved', description: 'Added to your saved searches' });
  };

  const handleVoiceSearch = () => {
    if (!('webkitSpeechRecognition' in window)) {
      toast({
        title: 'Voice search not supported',
        description: 'Your browser does not support voice search.',
        variant: 'destructive',
      });
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
    };

    recognition.start();
  };

  const handleFlowaIr = async () => {
    if (!user || !query.trim()) {
      toast({
        title: "Enter a query",
        description: "Type something to search with AI",
      });
      return;
    }
    callFlowaIr(query);
  };

  const callFlowaIr = async (item: any) => {
    setSearchResults([]);
    try {
      const { data, error } = await supabase.functions.invoke('flowair-search', {
        body: { item }
      });

      if (error) {
        if (error.message?.includes('402') || error.message?.includes('credits')) {
          toast({
            title: "Out of AI Credits",
            description: "You need more stars to use FlowaIr.",
            variant: "destructive"
          });
        } else {
          throw error;
        }
        return;
      }
      if (data) {
        setFlowaIrResponse(data);
      }
    } catch (error: any) {
      console.error('FlowaIr error:', error);
      toast({
        title: "FlowaIr Error",
        description: "Failed to get AI response.",
        variant: "destructive"
      });
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults([]);
    setFlowaIrResponse(null);
  };

  return (
    <div className="w-full space-y-3">
      {/* Search Bar Container */}
      <div className="flex flex-col gap-2 p-3 bg-card rounded-lg border">
        {/* Main Search Row */}
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts, users, marketplace..."
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
            onFocus={() => setShowTrending(true)}
            onBlur={() => setTimeout(() => setShowTrending(false), 200)}
          />
          {query && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={clearSearch}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Users">Users</SelectItem>
              <SelectItem value="Posts">Posts</SelectItem>
              <SelectItem value="Marketplace">Marketplace</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 ml-auto">
            <Button
              size="sm"
              variant="ghost"
              className={`h-9 px-3 ${isListening ? 'text-destructive bg-destructive/10' : ''}`}
              onClick={handleVoiceSearch}
            >
              <Mic className="w-4 h-4 mr-1" />
              {isListening ? 'Listening...' : 'Voice'}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-3"
              onClick={saveSearch}
              disabled={!query}
            >
              <Bookmark className="w-4 h-4 mr-1" />
              Save
            </Button>

            <Button
              size="sm"
              variant="default"
              className="h-9 px-3"
              onClick={handleFlowaIr}
              disabled={!query.trim()}
            >
              <Sparkles className="w-4 h-4 mr-1" />
              AI Search
            </Button>
          </div>
        </div>
      </div>

      {/* Results Area */}
      {showTrending && !query && (
        <TrendingNow onSelect={(keyword) => {
          setQuery(keyword);
          setShowTrending(false);
        }} />
      )}

      {(searchResults.length > 0 || isSearching) && (
        <SearchResults
          results={searchResults}
          onSelect={handleFlowaIr}
          isLoading={isSearching}
        />
      )}

      {flowaIrResponse && <FlowaIr {...flowaIrResponse} />}

      {searchResults.length === 0 && query.length > 2 && !isSearching && !flowaIrResponse && (
        <div className="text-center p-6 bg-card rounded-lg border">
          <p className="text-muted-foreground mb-3">No results found for "{query}"</p>
          <Button variant="outline" onClick={() => navigate(`/`)}>
            Create a Post
          </Button>
        </div>
      )}
    </div>
  );
};

export default NewSearchBar;