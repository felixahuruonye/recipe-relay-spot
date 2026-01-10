import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Trash2, RefreshCw, Eye, Ban, Check } from 'lucide-react';

interface Post {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  view_count: number;
  likes_count: number;
  comments_count: number;
  created_at: string;
  user_id: string;
  disabled: boolean;
  media_urls: string[];
}

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

export const PostsTab: React.FC = () => {
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPosts();
    
    // Real-time updates
    const channel = supabase
      .channel('admin-posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => loadPosts())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadPosts = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    setPosts(data || []);

    // Fetch user profiles
    const userIds = [...new Set((data || []).map(p => p.user_id))];
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);

      const map: Record<string, Profile> = {};
      profs?.forEach(p => { map[p.id] = p; });
      setProfiles(map);
    }

    setLoading(false);
  };

  const updatePostStatus = async (postId: string, status: string) => {
    const { error } = await supabase
      .from('posts')
      .update({ status })
      .eq('id', postId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Updated', description: `Post ${status}` });
      loadPosts();
    }
  };

  const toggleDisabled = async (postId: string, currentDisabled: boolean) => {
    const { error } = await supabase
      .from('posts')
      .update({ disabled: !currentDisabled })
      .eq('id', postId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Updated', description: `Post ${!currentDisabled ? 'blocked' : 'restored'}` });
      loadPosts();
    }
  };

  const deletePost = async (postId: string) => {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deleted', description: 'Post permanently deleted' });
      loadPosts();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>All Posts ({posts.length})</CardTitle>
        <Button variant="outline" size="sm" onClick={loadPosts}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Loading posts...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">No posts found.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Likes</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => {
                  const author = profiles[post.user_id];
                  return (
                    <TableRow key={post.id} className={post.disabled ? 'opacity-50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {post.media_urls?.[0] && (
                            <img 
                              src={post.media_urls[0]} 
                              alt=""
                              className="w-8 h-8 object-cover rounded"
                            />
                          )}
                          <span className="font-medium max-w-[150px] truncate">{post.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>{author?.username || 'Unknown'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{post.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={post.status === 'approved' ? 'default' : 'secondary'}>
                          {post.status}
                        </Badge>
                        {post.disabled && (
                          <Badge variant="destructive" className="ml-1">Blocked</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {post.view_count || 0}
                        </div>
                      </TableCell>
                      <TableCell>{post.likes_count || 0}</TableCell>
                      <TableCell>{post.comments_count || 0}</TableCell>
                      <TableCell>{new Date(post.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {post.status !== 'approved' && (
                            <Button size="sm" onClick={() => updatePostStatus(post.id, 'approved')}>
                              <Check className="w-4 h-4" />
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant={post.disabled ? 'default' : 'outline'}
                            onClick={() => toggleDisabled(post.id, post.disabled)}
                          >
                            <Ban className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => deletePost(post.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
