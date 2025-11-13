import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Skeleton } from '@/components/ui/skeleton';

interface SearchResultsProps {
  results: any[];
  onSelect: (item: any) => void;
  isLoading: boolean;
}

const SearchResults: React.FC<SearchResultsProps> = ({ results, onSelect, isLoading }) => {
  if (isLoading) {
    return (
      <Card className="absolute top-full mt-2 w-full z-10">
        <CardContent className="p-4 space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const posts = results.filter((item) => item.type === 'post');
  const users = results.filter((item) => item.type === 'user');
  const marketplaceItems = results.filter((item) => item.type === 'marketplace');

  return (
    <Card className="absolute top-full mt-2 w-full z-10">
      <CardContent className="p-4">
        <Tabs defaultValue="posts">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          </TabsList>
          <TabsContent value="posts">
            {posts.map((post) => (
              <div
                key={post.id}
                className="flex items-center gap-4 p-2 cursor-pointer hover:bg-muted"
                onClick={() => onSelect(post)}
              >
                <img
                  src={post.thumbnail}
                  alt={post.title}
                  className="w-12 h-12 rounded-md object-cover"
                />
                <div>
                  <h4 className="font-semibold">{post.title}</h4>
                  <p className="text-sm text-muted-foreground">{post.preview}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {post.is_hot_topic && <Badge variant="destructive">Hot Topic</Badge>}
                    {post.is_trending && <Badge variant="secondary">Trending</Badge>}
                    {post.is_new && <Badge>New</Badge>}
                    <span className="text-xs text-muted-foreground">{post.view_count} views</span>
                    <span className="text-xs text-muted-foreground">{post.likes_count} reactions</span>
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="users">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-4 p-2 cursor-pointer hover:bg-muted"
                onClick={() => onSelect(user)}
              >
                <Avatar>
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback>{user.username.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-semibold">{user.username}</h4>
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="marketplace">
            {marketplaceItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 p-2 cursor-pointer hover:bg-muted"
                onClick={() => onSelect(item)}
              >
                <img
                  src={item.thumbnail}
                  alt={item.name}
                  className="w-12 h-12 rounded-md object-cover"
                />
                <div>
                  <h4 className="font-semibold">{item.name}</h4>
                  <p className="text-sm text-muted-foreground">{item.price}</p>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default SearchResults;
