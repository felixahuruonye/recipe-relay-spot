import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Mic, Flame, Clock, TrendingUp, Calendar, Plus, Bookmark, Eye, Heart } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { useNavigate } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TrendingKeyword {
  keyword: string;
  search_count: number;
  last_search_at: string;
}

const categories = [
  { value: 'all', label: 'All Categories' },
  { value: 'Jollof Rice', label: 'Jollof Rice' },
  { value: 'Desserts', label: 'Desserts' },
  { value: 'Equipment', label: 'Equipment' },
  { value: 'For Sale', label: 'For Sale' },
  { value: 'Tips & Tricks', label: 'Tips & Tricks' },
  { value: 'Restaurants Reviews', label: 'Restaurants Reviews' },
  { value: 'Recipes', label: 'Recipes' },
  { value: 'Cooking videos', label: 'Cooking videos' },
  { value: 'General Discussion', label: 'General Discussion' },
];

export const AdvancedSearchBar = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isListening, transcript, startListening, stopListening } = useVoiceSearch();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [viewedResults, setViewedResults] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [flowaIrResponse, setFlowaIrResponse] = useState<string>('');
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (transcript) {
      setSearchQuery(transcript);
      handleSearch(transcript);
    }
  }, [transcript]);

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    
    try {
      await supabase.rpc('track_search', { search_keyword: query.trim() });

      let searchQuery = supabase
        .from('posts')
        .select('*')
        .eq('status', 'approved')
        .or(`title.ilike.%${query}%,body.ilike.%${query}%`);

      const { data: posts } = await searchQuery.order('created_at', { ascending: false }).limit(50);
      
      setSearchResults(posts?.filter(p => p.post_status === 'new') || []);
      setViewedResults(posts?.filter(p => p.post_status === 'viewed') || []);

      if (user) {
        const { data } = await supabase.functions.invoke('flowair-search', {
          body: { query, results: posts || [], trending: [] }
        });
        if (data?.aiResponse) setFlowaIrResponse(data.aiResponse);
      }
      
      setShowResults(true);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search posts or ask FlowaIr..."
          className="pl-10 pr-20"
        />
        <div className="absolute right-2 top-2 flex gap-1">
          <Button
            size="icon"
            variant={isListening ? 'default' : 'ghost'}
            onClick={isListening ? stopListening : startListening}
          >
            <Mic className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Search Results</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[70vh]">
            {flowaIrResponse && (
              <Card className="mb-4 glass-card">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-2">🤖 FlowaIr Answers</h3>
                  <p className="text-sm">{flowaIrResponse}</p>
                </CardContent>
              </Card>
            )}
            <Tabs defaultValue="new">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="new">🆕 New Posts ({searchResults.length})</TabsTrigger>
                <TabsTrigger value="viewed">🕓 Viewed ({viewedResults.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="new" className="space-y-3 mt-4">
                {searchResults.map(post => (
                  <Card key={post.id} className="cursor-pointer" onClick={() => navigate(`/?post=${post.id}`)}>
                    <CardContent className="p-4">
                      <h4 className="font-medium">{post.title}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">{post.body}</p>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
              <TabsContent value="viewed" className="space-y-3 mt-4">
                {viewedResults.map(post => (
                  <Card key={post.id} className="cursor-pointer" onClick={() => navigate(`/?post=${post.id}`)}>
                    <CardContent className="p-4">
                      <h4 className="font-medium">{post.title}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">{post.body}</p>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
