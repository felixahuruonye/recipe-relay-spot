import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, ImageIcon, Video, Eye, Heart, MessageCircle, Play, Loader2, DollarSign, ListChecks, Clock, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PostEarning {
  post_id: string;
  title: string;
  media_urls: string[];
  view_count: number;
  created_at: string;
  earned: number;
  likes: number;
  comments: number;
}

interface StoryEarning {
  storyline_id: string;
  media_url: string;
  media_type?: string | null;
  caption: string | null;
  created_at: string;
  expires_at: string;
  expired: boolean;
  earned: number;
}

const nf = (n: number) => `₦${Number(n || 0).toLocaleString()}`;

const CreatorEarnings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [monetized, setMonetized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostEarning[]>([]);
  const [stories, setStories] = useState<StoryEarning[]>([]);
  const [tasks, setTasks] = useState<any>(null);

  const [detailPost, setDetailPost] = useState<PostEarning | null>(null);
  const [detailStory, setDetailStory] = useState<StoryEarning | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (user?.id) fetchAll();
  }, [user?.id]);

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('monetization_level')
        .eq('id', user.id)
        .single();
      setMonetized((profile?.monetization_level || 0) > 0);

      const [postsRes, storiesRes, tasksRes] = await Promise.all([
        supabase.rpc('get_creator_post_earnings' as any),
        supabase.rpc('get_creator_story_earnings' as any),
        supabase.rpc('get_creator_task_earnings' as any),
      ]);
      if (postsRes.error) throw postsRes.error;
      if (storiesRes.error) throw storiesRes.error;
      if (tasksRes.error) throw tasksRes.error;
      setPosts((postsRes.data as any) || []);
      setStories((storiesRes.data as any) || []);
      setTasks(tasksRes.data as any);
    } catch (error: any) {
      console.error('Error fetching earnings:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to load earnings', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openPostDetails = async (post: PostEarning) => {
    setDetailPost(post);
    setDetailLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_post_earning_details' as any, { p_post_id: post.post_id });
      if (error) throw error;
      setDetailData(data);
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to load details', variant: 'destructive' });
    } finally {
      setDetailLoading(false);
    }
  };

  const openStoryDetails = async (story: StoryEarning) => {
    setDetailStory(story);
    setDetailLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_story_earning_details' as any, { p_storyline_id: story.storyline_id });
      if (error) throw error;
      setDetailData(data);
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to load details', variant: 'destructive' });
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/creator-dashboard')}><ArrowLeft className="w-5 h-5" /></button>
        <div>
          <h1 className="text-2xl font-bold gradient-text">Earnings</h1>
          <p className="text-sm text-muted-foreground">Post, story, and task earnings breakdown</p>
        </div>
      </div>

      <Tabs defaultValue="posts">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="posts">Post Earnings</TabsTrigger>
          <TabsTrigger value="stories">Story Earnings</TabsTrigger>
          <TabsTrigger value="tasks">Task Earnings</TabsTrigger>
        </TabsList>

        {/* ===================== POSTS ===================== */}
        <TabsContent value="posts" className="space-y-3 mt-4">
          {posts.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No posts yet</CardContent></Card>
          ) : posts.map(p => {
            const thumb = p.media_urls?.[0];
            const isVideo = thumb?.match(/\.(mp4|webm|ogg|mov)$/i) || thumb?.includes('video');
            return (
              <Card key={p.post_id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                    {thumb ? (
                      isVideo ? <video src={thumb} className="w-full h-full object-cover" /> : <img src={thumb} className="w-full h-full object-cover" />
                    ) : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.title || 'Untitled post'}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
                    <p className="text-sm font-semibold mt-0.5">
                      {monetized ? nf(p.earned) : <span className="text-muted-foreground font-normal">Not yet monetized</span>}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openPostDetails(p)}>More details</Button>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ===================== STORIES ===================== */}
        <TabsContent value="stories" className="space-y-3 mt-4">
          {!monetized ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Story earnings only show once you're monetized</CardContent></Card>
          ) : stories.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No stories yet</CardContent></Card>
          ) : stories.map(s => {
            const isVideo = s.media_type === 'video' || s.media_url?.match(/\.(mp4|webm|ogg|mov)$/i);
            return (
              <Card key={s.storyline_id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center relative">
                    {s.media_url && (isVideo ? <video src={s.media_url} className="w-full h-full object-cover" /> : <img src={s.media_url} className="w-full h-full object-cover" />)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.caption || 'Story'}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</p>
                      <Badge variant={s.expired ? 'outline' : 'default'} className="text-[10px]">{s.expired ? 'Expired' : 'Live'}</Badge>
                    </div>
                    <p className="text-sm font-semibold mt-0.5">{nf(s.earned)}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openStoryDetails(s)}>More details</Button>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ===================== TASKS ===================== */}
        <TabsContent value="tasks" className="space-y-4 mt-4">
          {tasks && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><CheckCircle2 className="w-4 h-4" /> Stars Claimed</div>
                    <p className="text-2xl font-bold">{tasks.total_stars_claimed || 0}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><DollarSign className="w-4 h-4" /> Earned</div>
                    <p className="text-2xl font-bold">{nf(tasks.total_naira_earned)}</p>
                  </CardContent>
                </Card>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-2"><Clock className="w-4 h-4" /> Pending / In Progress</p>
                {(!tasks.pending || tasks.pending.length === 0) ? (
                  <p className="text-sm text-muted-foreground">Nothing in progress right now</p>
                ) : (
                  <div className="space-y-2">
                    {tasks.pending.map((t: any, i: number) => (
                      <Card key={i}><CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{t.task_title}</p>
                          <p className="text-xs text-muted-foreground">{t.provider} · started {new Date(t.created_at).toLocaleDateString()}</p>
                        </div>
                        <Badge variant="outline">Not yet claimed</Badge>
                      </CardContent></Card>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-2"><ListChecks className="w-4 h-4" /> Completed</p>
                {(!tasks.completed || tasks.completed.length === 0) ? (
                  <p className="text-sm text-muted-foreground">No completed tasks yet</p>
                ) : (
                  <div className="space-y-2">
                    {tasks.completed.map((t: any, i: number) => (
                      <Card key={i}><CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{t.task_title}</p>
                          <p className="text-xs text-muted-foreground">{t.provider} · {new Date(t.completed_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{nf(t.naira_credited)}</p>
                          <p className="text-xs text-muted-foreground">{t.stars_credited}★</p>
                        </div>
                      </CardContent></Card>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Post details modal */}
      <Dialog open={!!detailPost} onOpenChange={(o) => { if (!o) { setDetailPost(null); setDetailData(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{detailPost?.title || 'Post details'}</DialogTitle></DialogHeader>
          {detailLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : detailData && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-muted/50"><Eye className="w-4 h-4 mx-auto mb-1" /><p className="text-sm font-semibold">{detailData.views}</p><p className="text-[10px] text-muted-foreground">Views</p></div>
                <div className="p-2 rounded-lg bg-muted/50"><Heart className="w-4 h-4 mx-auto mb-1" /><p className="text-sm font-semibold">{detailData.likes}</p><p className="text-[10px] text-muted-foreground">Likes</p></div>
                <div className="p-2 rounded-lg bg-muted/50"><MessageCircle className="w-4 h-4 mx-auto mb-1" /><p className="text-sm font-semibold">{detailData.comments}</p><p className="text-[10px] text-muted-foreground">Comments</p></div>
              </div>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center justify-between">
                <span className="text-sm">Tips received ({detailData.tips_received_count})</span>
                <span className="font-semibold">{nf(detailData.tips_received_amount)}</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p>Ads watched (last 30 days, account-wide): {detailData.ads_watched_30d}</p>
                <p>Your follows given to others: {detailData.my_follows_given}</p>
                <p>Your likes given to others: {detailData.my_likes_given}</p>
                <p>Your comments given to others: {detailData.my_comments_given}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Story details modal */}
      <Dialog open={!!detailStory} onOpenChange={(o) => { if (!o) { setDetailStory(null); setDetailData(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{detailStory?.caption || 'Story details'}</DialogTitle></DialogHeader>
          {detailLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : detailData && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 rounded-lg bg-muted/50"><Eye className="w-4 h-4 mx-auto mb-1" /><p className="text-sm font-semibold">{detailData.views}</p><p className="text-[10px] text-muted-foreground">Views</p></div>
                <div className="p-2 rounded-lg bg-muted/50"><Heart className="w-4 h-4 mx-auto mb-1" /><p className="text-sm font-semibold">{detailData.reactions}</p><p className="text-[10px] text-muted-foreground">Reactions</p></div>
              </div>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center justify-between">
                <span className="text-sm">Earned</span>
                <span className="font-semibold">{nf(detailData.earned)}</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p>Ads watched (last 30 days, account-wide): {detailData.ads_watched_30d}</p>
                <p>Your reactions given on others' storylines: {detailData.my_reactions_given_on_others}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreatorEarnings;
