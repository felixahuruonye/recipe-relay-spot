import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Image, Video, Eye, Heart } from 'lucide-react';

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

  // Helper to get thumbnail from various sources
  const getThumbnail = (item: any): string | null => {
    // Check thumbnail_url first
    if (item.thumbnail_url) return item.thumbnail_url;
    // Check thumbnail
    if (item.thumbnail) return item.thumbnail;
    // Check media_urls array
    if (item.media_urls && Array.isArray(item.media_urls) && item.media_urls.length > 0) {
      return item.media_urls[0];
    }
    // Check images array (for marketplace)
    if (item.images && Array.isArray(item.images) && item.images.length > 0) {
      return item.images[0];
    }
    return null;
  };

  // Check if URL is a video
  const isVideoUrl = (url: string): boolean => {
    return url.match(/\.(mp4|webm|ogg|mov)$/i) !== null || url.includes('video');
  };

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
              posts.map((post) => {
                const thumbnail = getThumbnail(post);
                const isVideo = thumbnail ? isVideoUrl(thumbnail) : false;
                
                return (
                  <div
                    key={post.id}
                    className="flex items-center gap-4 p-2 cursor-pointer hover:bg-muted rounded-md"
                    onClick={() => onSelect(post)}
                  >
                    {/* Thumbnail with media type indicator */}
                    <div className="relative w-14 h-14 shrink-0">
                      {thumbnail ? (
                        <>
                          {isVideo ? (
                            <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                              <video 
                                src={thumbnail} 
                                className="w-full h-full object-cover"
                                muted
                                preload="metadata"
                              />
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                <Video className="w-5 h-5 text-white" />
                              </div>
                            </div>
                          ) : (
                            <img
                              src={thumbnail}
                              alt={post.title || 'Post'}
                              className="w-14 h-14 rounded-md object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                        </>
                      ) : (
                        <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center">
                          <Image className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold truncate">{post.title || 'Untitled'}</h4>
                      {post.body && (
                        <p className="text-sm text-muted-foreground truncate">{post.body.substring(0, 60)}...</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {post.is_hot_topic && <Badge variant="destructive" className="text-xs">Hot Topic</Badge>}
                        {post.is_trending && <Badge variant="secondary" className="text-xs">Trending</Badge>}
                        {post.is_new && <Badge className="text-xs">New</Badge>}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {Number(post.view_count) || 0}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          {Number(post.likes_count) || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
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
              marketplaceItems.map((item) => {
                const thumbnail = getThumbnail(item);
                
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-2 cursor-pointer hover:bg-muted rounded-md"
                    onClick={() => onSelect(item)}
                  >
                    <div className="relative w-14 h-14 shrink-0">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={item.name || item.title || 'Item'}
                          className="w-14 h-14 rounded-md object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center">
                          <Image className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
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
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default SearchResults;