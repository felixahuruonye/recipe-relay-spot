import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

interface SearchResultsProps {
  results?: any[];
  onSelect: (item: any) => void;
  isLoading?: boolean;
}

const SearchResults: React.FC<SearchResultsProps> = ({ results = [], onSelect, isLoading = false }) => {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const posts = results.filter((item) => item?.type === 'post');
  const users = results.filter((item) => item?.type === 'user');
  const marketplaceItems = results.filter((item) => item?.type === 'marketplace');

  return (
    <Card>
      <CardContent className="p-4">
        <Tabs defaultValue="posts">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="posts">Posts ({posts.length})</TabsTrigger>
            <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
            <TabsTrigger value="marketplace">Marketplace ({marketplaceItems.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="posts" className="max-h-64 overflow-y-auto">
            {posts.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">No posts found</p>
            ) : (
              posts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center gap-4 p-2 cursor-pointer hover:bg-muted rounded-md"
                  onClick={() => onSelect(post)}
                >
                  {(post.thumbnail_url || post.thumbnail) && (
                    <img
                      src={post.thumbnail_url || post.thumbnail}
                      alt={post.title || 'Post'}
                      className="w-12 h-12 rounded-md object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate">{post.title || 'Untitled'}</h4>
                    {post.body && (
                      <p className="text-sm text-muted-foreground truncate">{post.body.substring(0, 60)}...</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {post.is_hot_topic && <Badge variant="destructive">Hot Topic</Badge>}
                      {post.is_trending && <Badge variant="secondary">Trending</Badge>}
                      {post.is_new && <Badge>New</Badge>}
                      <span className="text-xs text-muted-foreground">{Number(post.view_count) || 0} views</span>
                      <span className="text-xs text-muted-foreground">{Number(post.likes_count) || 0} reactions</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
          <TabsContent value="users" className="max-h-64 overflow-y-auto">
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">No users found</p>
            ) : (
              users.map((user) => {
                const username = user?.username || 'User';
                return (
                  <div
                    key={user.id}
                    className="flex items-center gap-4 p-2 cursor-pointer hover:bg-muted rounded-md"
                    onClick={() => onSelect(user)}
                  >
                    <Avatar>
                      <AvatarImage src={user.avatar_url} />
                      <AvatarFallback>{username.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h4 className="font-semibold">{username}</h4>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>
          <TabsContent value="marketplace" className="max-h-64 overflow-y-auto">
            {marketplaceItems.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">No marketplace items found</p>
            ) : (
              marketplaceItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-2 cursor-pointer hover:bg-muted rounded-md"
                  onClick={() => onSelect(item)}
                >
                  {(item.thumbnail || item.images?.[0]) && (
                    <img
                      src={item.thumbnail || item.images?.[0]}
                      alt={item.name || item.title || 'Item'}
                      className="w-12 h-12 rounded-md object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate">{item.name || item.title || 'Unnamed Item'}</h4>
                    {item.description && (
                      <p className="text-sm text-muted-foreground truncate">{item.description.substring(0, 50)}...</p>
                    )}
                    <p className="text-sm font-medium text-primary">
                      {item.price_ngn ? `₦${Number(item.price_ngn).toLocaleString()}` : 'Price not set'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default SearchResults;
