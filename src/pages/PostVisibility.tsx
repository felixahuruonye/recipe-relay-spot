import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UserPost {
  id: string;
  title: string | null;
  body: string | null;
  comments_enabled: boolean | null;
  views_visible: boolean | null;
  created_at: string;
  media_urls: string[] | null;
}

export default function PostVisibility() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      // Select core columns; visibility columns may not exist until migration is applied
      const { data, error } = await supabase
        .from('posts')
        .select('id, title, body, created_at, media_urls, comments_enabled, views_visible')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        // Fallback without new columns
        const { data: fallback } = await supabase
          .from('posts')
          .select('id, title, body, created_at, media_urls')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        setPosts((fallback || []).map((p: any) => ({
          ...p,
          comments_enabled: true,
          views_visible: true,
        })));
      } else {
        setPosts((data as any) || []);
      }
      setLoading(false);
    })();
  }, [user]);

  const toggle = async (postId: string, field: 'comments_enabled' | 'views_visible', value: boolean) => {
    setPosts(prev => prev.map(p => (p.id === postId ? { ...p, [field]: value } : p)));
    const { error } = await supabase.from('posts').update({ [field]: value } as any).eq('id', postId);
    if (error) {
      setPosts(prev => prev.map(p => (p.id === postId ? { ...p, [field]: !value } : p)));
      toast({
        title: 'Could not update',
        description: error.message.includes('column')
          ? 'Run the SQL migration for comments_enabled / views_visible first.'
          : error.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: value ? 'Enabled' : 'Disabled' });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Post & Visibility</h1>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <p className="text-sm text-muted-foreground">
          Turn comments or view counts off for individual posts. Changes show on the feed right away.
        </p>

        {loading && <p className="text-sm text-muted-foreground">Loading your posts…</p>}
        {!loading && posts.length === 0 && (
          <p className="text-sm text-muted-foreground">You have no posts yet.</p>
        )}

        {posts.map(p => (
          <Card key={p.id}>
            <CardContent className="p-4 flex gap-3">
              {p.media_urls?.[0] ? (
                <img
                  src={p.media_urls[0]}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover shrink-0 bg-muted"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-muted shrink-0" />
              )}
              <div className="flex-1 min-w-0 space-y-3">
                <p className="text-sm font-medium line-clamp-2">
                  {p.title || p.body?.slice(0, 60) || 'Untitled post'}
                </p>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-muted-foreground" />
                      Allow comments
                    </span>
                    <Switch
                      checked={p.comments_enabled !== false}
                      onCheckedChange={v => toggle(p.id, 'comments_enabled', v)}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      Show view count
                    </span>
                    <Switch
                      checked={p.views_visible !== false}
                      onCheckedChange={v => toggle(p.id, 'views_visible', v)}
                    />
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
