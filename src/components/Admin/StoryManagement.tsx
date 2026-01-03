import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star } from 'lucide-react';

export const StoryManagement = () => {
  const [stories, setStories] = useState<any[]>([]);

  useEffect(() => {
    loadStories();
    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, []);

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('admin-stories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_storylines' }, loadStories)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const loadStories = async () => {
    const { data } = await supabase
      .from('user_storylines')
      .select(`
        *,
        user_profiles (username, avatar_url)
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    setStories(data || []);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Story Management ({stories.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead>Stars</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created (date/time)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stories.map((story) => (
                <TableRow key={story.id}>
                  <TableCell className="font-medium">{story.user_profiles?.username}</TableCell>
                  <TableCell>
                    <a href={story.media_url} target="_blank" rel="noreferrer" className="text-sm underline">
                      Open
                    </a>
                  </TableCell>
                  <TableCell>
                    {story.star_price > 0 ? (
                      <Badge variant="secondary">
                        {story.star_price}
                        <Star className="h-3 w-3 ml-1 inline" />
                      </Badge>
                    ) : (
                      <Badge variant="outline">Free</Badge>
                    )}
                  </TableCell>
                  <TableCell>{story.view_count || 0}</TableCell>
                  <TableCell>
                    <Badge variant="default">active</Badge>
                  </TableCell>
                  <TableCell>{new Date(story.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

