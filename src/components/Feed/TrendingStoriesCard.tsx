import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TrendingStory {
  id: string;
  user_id: string;
  media_url: string | null;
  media_type: string | null;
  view_count: number | null;
  caption: string | null;
}

export const TrendingStoriesCard = () => {
  const navigate = useNavigate();
  const [stories, setStories] = useState<TrendingStory[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from('user_storylines')
        .select('id, user_id, media_url, media_type, view_count, caption')
        .eq('status', 'active')
        .gte('created_at', since)
        .order('view_count', { ascending: false })
        .limit(10);
      // Random shuffle so it differs each render
      const shuffled = ((data as any) || []).sort(() => Math.random() - 0.5);
      setStories(shuffled);
    })();
  }, []);

  // Auto-advance every 5s (image) — for video we'd need onEnded; keep simple 5s
  useEffect(() => {
    if (stories.length === 0) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % stories.length), 5000);
    return () => clearTimeout(t);
  }, [idx, stories.length]);

  if (stories.length === 0) return null;

  const story = stories[idx];
  const isVideo = story.media_type?.startsWith('video');

  return (
    <Card className="mx-3 my-2 overflow-hidden border-primary/30 bg-gradient-to-br from-purple-900/20 via-pink-900/10 to-blue-900/20">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-bold">Trending Stories</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{idx + 1}/{stories.length}</span>
        </div>

        <div className="relative aspect-[9/16] max-h-[420px] rounded-lg overflow-hidden bg-black">
          {story.media_url ? (
            isVideo ? (
              <video
                key={story.id}
                src={story.media_url}
                className="w-full h-full object-cover"
                autoPlay
                muted
                playsInline
                onEnded={() => setIdx((i) => (i + 1) % stories.length)}
              />
            ) : (
              <img src={story.media_url} alt="" className="w-full h-full object-cover" />
            )
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/40 to-accent/40" />
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
            <p className="text-white text-xs line-clamp-2">{story.caption || 'Trending now'}</p>
            <p className="text-white/70 text-[10px] flex items-center gap-1">
              <Eye className="w-3 h-3" /> {story.view_count || 0} views
            </p>
          </div>

          <button
            className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/40 rounded-full p-1"
            onClick={() => setIdx((i) => (i - 1 + stories.length) % stories.length)}
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <button
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/40 rounded-full p-1"
            onClick={() => setIdx((i) => (i + 1) % stories.length)}
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate('/?storyline=open')}>
            View More
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => alert('Create Video With AI — coming soon!')}
          >
            ✨ Create With AI
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TrendingStoriesCard;
