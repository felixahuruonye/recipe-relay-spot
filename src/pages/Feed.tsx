import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageCircle, Share, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Post {
  id: string;
  title: string;
  body: string;
  media_urls: string[];
  category: string;
  created_at: string;
  status: string;
  boosted: boolean;
  boost_until: string | null;
  comments_count: number;
  likes_count: number;
  user_id: string;
}

const Feed = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      // Simple posts query without user joins for now
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (postsError) throw postsError;
      
      setPosts(postsData || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
      toast({
        title: "Error",
        description: "Failed to load posts. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-muted rounded-full"></div>
                  <div className="h-4 bg-muted rounded w-24"></div>
                </div>
                <div className="h-6 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary mb-4">SaveMore Community</h1>
        <Button className="w-full" size="lg">
          <Plus className="w-4 h-4 mr-2" />
          Create Post
        </Button>
      </div>

      {/* Posts */}
      <div className="space-y-4">
        {posts.map((post) => (
          <Card key={post.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback>
                      U
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold">User</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(post.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {post.boosted && (
                  <Badge variant="outline" className="text-xs">Boosted</Badge>
                )}
              </div>
              <div>
                <h3 className="font-semibold mb-2">{post.title}</h3>
                <Badge variant="outline" className="text-xs">{post.category}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm mb-4">{post.body}</p>
              
              {/* Media */}
              {post.media_urls && post.media_urls.length > 0 && (
                <div className="mb-4">
                  <img 
                    src={post.media_urls[0]} 
                    alt="Post media"
                    className="w-full rounded-lg object-cover max-h-64"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center space-x-4">
                  <Button variant="ghost" size="sm" className="p-0">
                    <Heart className="w-4 h-4 mr-1" />
                    <span className="text-xs">{post.likes_count}</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="p-0">
                    <MessageCircle className="w-4 h-4 mr-1" />
                    <span className="text-xs">{post.comments_count}</span>
                  </Button>
                </div>
                <Button variant="ghost" size="sm" className="p-0">
                  <Share className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {posts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No posts yet. Be the first to share!</p>
        </div>
      )}
    </div>
  );
};

export default Feed;