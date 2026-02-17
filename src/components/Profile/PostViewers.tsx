import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Viewer {
  id: string;
  username: string;
  avatar_url: string | null;
  viewed_at: string;
}

interface PostViewersProps {
  postId: string;
  viewCount: number;
}

export const PostViewers: React.FC<PostViewersProps> = ({ postId, viewCount }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveViewCount, setLiveViewCount] = useState(viewCount);

  // Sync prop changes
  useEffect(() => {
    setLiveViewCount(viewCount);
  }, [viewCount]);

  // Real-time subscription for view count updates
  useEffect(() => {
    const channel = supabase
      .channel(`post-views-${postId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_views', filter: `post_id=eq.${postId}` }, () => {
        setLiveViewCount(prev => prev + 1);
        // If dialog is open, reload viewers
        if (open) loadViewers();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [postId, open]);

  const loadViewers = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('post_views')
        .select('user_id, viewed_at')
        .eq('post_id', postId)
        .order('viewed_at', { ascending: false });

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(v => v.user_id))];
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        setViewers(data.map(v => ({
          id: v.user_id,
          username: profileMap.get(v.user_id)?.username || 'Unknown',
          avatar_url: profileMap.get(v.user_id)?.avatar_url || null,
          viewed_at: v.viewed_at,
        })));
        setLiveViewCount(data.length);
      } else {
        setViewers([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    loadViewers();
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Eye className="w-4 h-4" />
        <span>{liveViewCount || 0}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm max-h-[70vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Post Viewers ({viewers.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 overflow-y-auto max-h-[50vh]">
            {loading ? (
              <p className="text-center text-muted-foreground py-4">Loading…</p>
            ) : viewers.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No views yet</p>
            ) : (
              viewers.map((v, i) => (
                <div
                  key={`${v.id}-${i}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                  onClick={() => { setOpen(false); navigate(`/profile/${v.id}`); }}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={v.avatar_url || ''} />
                    <AvatarFallback>{v.username[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{v.username}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.viewed_at).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
