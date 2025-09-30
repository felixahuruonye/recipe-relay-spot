import { useState, useEffect } from 'react';
import { Search, Send, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
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
}

export const SearchBar = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchType, setSearchType] = useState<'all' | 'users' | 'posts' | 'category'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const categories = ['General', 'Tech', 'Sports', 'Entertainment', 'News', 'Other'];

  useEffect(() => {
    if (query.length > 0) {
      searchContent();
    } else {
      setResults([]);
      setIsOpen(false);
    }
  }, [query, searchType, selectedCategory]);

  const searchContent = async () => {
    const searchResults: SearchResult[] = [];

    // Search users
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

    // Search posts by title
    if (searchType === 'all' || searchType === 'posts') {
      const { data: posts } = await supabase
        .from('posts')
        .select('id, title, category')
        .ilike('title', `%${query}%`)
        .eq('status', 'approved')
        .limit(5);

      if (posts) {
        searchResults.push(...posts.map(post => ({
          id: post.id,
          type: 'post' as const,
          title: post.title,
          subtitle: post.category,
        })));
      }
    }

    // Search posts by category
    if (searchType === 'category' && selectedCategory) {
      const { data: posts } = await supabase
        .from('posts')
        .select('id, title, category')
        .eq('category', selectedCategory)
        .eq('status', 'approved')
        .limit(10);

      if (posts) {
        searchResults.push(...posts.map(post => ({
          id: post.id,
          type: 'post' as const,
          title: post.title,
          subtitle: post.category,
        })));
      }
    }

    setResults(searchResults);
    setIsOpen(searchResults.length > 0);
  };

  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'user') {
      navigate(`/profile/${result.id}`);
    } else {
      // Scroll to post in feed or open post detail
      const postElement = document.getElementById(`post-${result.id}`);
      if (postElement) {
        postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="relative w-full mb-6">
      <Card className="p-4">
        <div className="flex gap-2">
          <Select value={searchType} onValueChange={(val: any) => setSearchType(val)}>
            <SelectTrigger className="w-32">
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
              <SelectTrigger className="w-40">
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
              placeholder="Search users, posts, or categories..."
              className="pl-10 pr-10"
            />
          </div>

          <Button size="icon" onClick={searchContent}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {isOpen && (
        <Card className="absolute z-50 w-full mt-2 max-h-96 overflow-y-auto bg-background border shadow-lg">
          {results.length > 0 ? (
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
                    <div className="flex-1">
                      <p className="font-medium">{result.title}</p>
                      <p className="text-sm text-muted-foreground">{result.subtitle}</p>
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-muted-foreground mb-4">No results found</p>
              {searchType !== 'users' && (
                <Button onClick={() => navigate('/create-post')} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Post
                </Button>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
