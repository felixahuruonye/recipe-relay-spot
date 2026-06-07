import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StorylineCard } from '@/components/Storyline/StorylineCard';
import { CreateStoryline } from '@/components/Storyline/CreateStoryline';
import { EnhancedStorylineViewer } from '@/components/Storyline/EnhancedStorylineViewer';
import { ArrowLeft, Plus, Sparkles, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Storyline = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stories, setStories] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const storyUsers = React.useMemo(() => {
    const map = new Map<string, any>();
    stories.forEach((story) => {
      const existing = map.get(story.user_id);
      if (!existing || new Date(story.created_at).getTime() > new Date(existing.created_at).getTime()) {
        map.set(story.user_id, story);
      }
    });
    return Array.from(map.values());
  }, [stories]);

  const loadStories = async () => {
    const { data } = await supabase
      .from('user_storylines')
      .select('*')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('view_count', { ascending: false })
      .order('created_at', { ascending: false });

    const userIds = [...new Set((data || []).map((s: any) => s.user_id))];
    const { data: profiles } = userIds.length
      ? await supabase.from('user_profiles').select('id, username, avatar_url, vip').in('id', userIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    setStories((data || []).map((s: any) => ({ ...s, user_profile: profileMap.get(s.user_id) })));
  };

  useEffect(() => {
    loadStories();
    if (user) supabase.from('user_profiles').select('username, avatar_url').eq('id', user.id).maybeSingle().then(({ data }) => setProfile(data));
  }, [user?.id]);

  const swipeStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = (e: React.TouchEvent) => { const t = e.touches[0]; swipeStartRef.current = { x: t.clientX, y: t.clientY }; };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const s = swipeStartRef.current; swipeStartRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x; const dy = t.clientY - s.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) navigate('/explore'); // swipe left -> explore
    else navigate('/'); // swipe right -> for you
  };

  return (
    <div onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd} className="min-h-[100dvh] bg-background px-4 py-4 pb-24 space-y-4 overflow-y-auto">

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-xl font-black gradient-text">Storyline</h1>
            <p className="text-xs text-muted-foreground">Watch full stories here to earn from Storyline views.</p>
          </div>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />Add</Button>
      </div>

      <button onClick={() => setShowCreate(true)} className="w-full rounded-2xl border border-primary/30 bg-primary/10 p-3 flex items-center gap-3 text-left">
        <Avatar className="w-12 h-12 ring-2 ring-primary/60"><AvatarImage src={profile?.avatar_url} /><AvatarFallback>{profile?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback></Avatar>
        <div className="flex-1 min-w-0"><p className="text-sm font-bold">Add to Storyline</p><p className="text-xs text-muted-foreground">Post photos or videos for 24 hours</p></div>
        <Sparkles className="w-5 h-5 text-primary" />
      </button>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {storyUsers.slice(0, 18).map((story) => (
          <StorylineCard key={story.id} type="story" previewUrl={story.preview_url || story.media_url} avatarUrl={story.user_profile?.avatar_url} username={story.user_profile?.username} starPrice={story.star_price} onSelect={() => setSelectedUserId(story.user_id)} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stories.map((story) => (
          <button key={`grid-${story.id}`} onClick={() => setSelectedUserId(story.user_id)} className="relative aspect-[9/14] rounded-2xl overflow-hidden border border-border bg-card text-left">
            {story.media_type === 'video' ? <video src={story.media_url} className="h-full w-full object-cover" muted playsInline /> : <img src={story.preview_url || story.media_url} alt={story.caption || 'Story'} className="h-full w-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/20" />
            <div className="absolute top-2 left-2 flex items-center gap-1"><Avatar className="w-7 h-7"><AvatarImage src={story.user_profile?.avatar_url} /><AvatarFallback>{story.user_profile?.username?.[0]}</AvatarFallback></Avatar>{story.user_profile?.vip && <Badge className="h-4 text-[9px] bg-yellow-400 text-black">VIP</Badge>}</div>
            <div className="absolute bottom-2 left-2 right-2"><p className="text-white text-xs font-bold truncate">@{story.user_profile?.username || 'user'}</p><p className="text-white/75 text-[10px] line-clamp-2">{story.caption || 'Storyline'}</p><p className="text-white/70 text-[10px] mt-1">👁 {story.view_count || 0}</p></div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card/60 p-3">
        <div className="flex items-center gap-2 mb-2"><Send className="w-4 h-4 text-primary" /><p className="text-sm font-bold">Send to friend</p></div>
        <div className="flex gap-2 overflow-x-auto"><p className="text-xs text-muted-foreground whitespace-nowrap">Open any story, then comment or share it to a friend from the viewer.</p></div>
      </div>

      {selectedUserId && <EnhancedStorylineViewer userId={selectedUserId} open={!!selectedUserId} onClose={() => setSelectedUserId(null)} />}
      {showCreate && <CreateStoryline autoOpen userProfile={profile} onCancel={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadStories(); }} />}
    </div>
  );
};

export default Storyline;
