import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Trash2, RefreshCw, Eye, Ban, Check, ExternalLink } from 'lucide-react';

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  caption: string | null;
  star_price: number | null;
  view_count: number | null;
  status: string | null;
  created_at: string;
  expires_at: string;
}

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

export const StoriesTab: React.FC = () => {
  const { toast } = useToast();
  const [stories, setStories] = useState<Story[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStories();
    
    // Real-time updates
    const channel = supabase
      .channel('admin-stories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_storylines' }, () => loadStories())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadStories = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('user_storylines')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    setStories(data || []);

    // Fetch user profiles
    const userIds = [...new Set((data || []).map(s => s.user_id))];
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

  const updateStoryStatus = async (storyId: string, status: string) => {
    const { error } = await supabase
      .from('user_storylines')
      .update({ status })
      .eq('id', storyId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Updated', description: `Story ${status}` });
      loadStories();
    }
  };

  const deleteStory = async (storyId: string) => {
    const { error } = await supabase
      .from('user_storylines')
      .delete()
      .eq('id', storyId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deleted', description: 'Story permanently deleted' });
      loadStories();
    }
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>All Stories ({stories.length})</CardTitle>
        <Button variant="outline" size="sm" onClick={loadStories}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Loading stories...</div>
        ) : stories.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">No stories found.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Preview</TableHead>
                  <TableHead>Uploader</TableHead>
                  <TableHead>Caption</TableHead>
                  <TableHead>Star Price</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stories.map((story) => {
                  const uploader = profiles[story.user_id];
                  const expired = isExpired(story.expires_at);
                  return (
                    <TableRow key={story.id} className={expired ? 'opacity-50' : ''}>
                      <TableCell>
                        <a href={story.media_url} target="_blank" rel="noopener noreferrer">
                          <img 
                            src={story.media_url} 
                            alt="Story"
                            className="w-12 h-12 object-cover rounded"
                          />
                        </a>
                      </TableCell>
                      <TableCell>{uploader?.username || 'Unknown'}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{story.caption || '-'}</TableCell>
                      <TableCell>
                        {story.star_price ? `⭐ ${story.star_price}` : 'Free'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {story.view_count || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={story.status === 'active' ? 'default' : 'secondary'}>
                          {story.status || 'active'}
                        </Badge>
                        {expired && (
                          <Badge variant="outline" className="ml-1">Expired</Badge>
                        )}
                      </TableCell>
                      <TableCell>{new Date(story.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(story.expires_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 flex-wrap">
                          <Button 
                            size="sm" 
                            variant="outline"
                            asChild
                          >
                            <a href={story.media_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </Button>
                          {story.status !== 'suspended' ? (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => updateStoryStatus(story.id, 'suspended')}
                            >
                              <Ban className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button 
                              size="sm"
                              onClick={() => updateStoryStatus(story.id, 'active')}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => deleteStory(story.id)}
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
