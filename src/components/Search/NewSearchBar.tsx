import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Mic, Send, Bookmark } from 'lucide-react';
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
    if (q.length < 2 && category === 'All') return;

    try {
      await supabase.rpc('track_search', { search_keyword: q || category });

      let allResults: any[] = [];

      // Search posts
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

      // Search users
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

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
    };

    recognition.start();
  };

  const handleFlowaIr = async () => {
    if (!user) return;
    // Call FlowaIr edge function directly - it handles credit checks internally
    callFlowaIr(query);
  };

  const callFlowaIr = async (item: any) => {
    setSearchResults([]);
    try {
      const { data, error } = await supabase.functions.invoke('flowair-search', {
        body: { item }
      });

      if (error) {
        // Check if it's a credit error
        if (error.message?.includes('402') || error.message?.includes('credits')) {
          toast({
            title: "Out of AI Credits",
            description: "You need more stars to use FlowaIr. Earn stars by viewing content!",
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
        description: "Failed to get AI response. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="w-full space-y-4 relative">
      <div className="flex items-center gap-2">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Categories</SelectItem>
            <SelectItem value="Users">Users</SelectItem>
            <SelectItem value="Posts">Posts</SelectItem>
            <SelectItem value="Marketplace">Marketplace</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="pr-10"
            onFocus={() => setShowTrending(true)}
            onBlur={() => setTimeout(() => setShowTrending(false), 200)}
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-10 top-1 h-8 w-8"
            onClick={() => setQuery('')}
          >
            <X className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={`absolute right-1 top-1 h-8 w-8 ${isListening ? 'text-red-500' : ''}`}
            onClick={handleVoiceSearch}
          >
            <Mic className="w-4 h-4" />
          </Button>
        </div>

        <Button size="icon">
          <Send className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={saveSearch}>
          <Bookmark className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={handleFlowaIr}>
          <img src="/flowair-logo.svg" alt="FlowaIr Logo" className="w-6 h-6" />
        </Button>
      </div>
      {showTrending && <TrendingNow onSelect={(keyword) => {
        setQuery(keyword);
        setShowTrending(false);
      }} />}
      {(searchResults.length > 0 || isSearching) && (
        <SearchResults
          results={searchResults}
          onSelect={handleFlowaIr}
          isLoading={isSearching}
        />
      )}
      {flowaIrResponse && <FlowaIr {...flowaIrResponse} />}
      {searchResults.length === 0 && query.length > 2 && !isSearching && (
        <div className="text-center p-4">
          <p className="text-muted-foreground mb-4">No results found for "{query}"</p>
          <Button onClick={() => navigate(`/`)}>Create Post</Button>
        </div>
      )}
    </div>
  );
};

export default NewSearchBar;