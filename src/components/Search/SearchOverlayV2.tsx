import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Clock, Video, Users, ShoppingBag, Music2, Bookmark, Trash2, Flame, Eye, Heart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MediaThumb, isVideoUrl } from '@/components/Feed/MediaThumb';

interface Props {
  open: boolean;
  onClose: () => void;
}

type TabKey = 'history' | 'videos' | 'people' | 'products' | 'music';

export const SearchOverlayV2: React.FC<Props> = ({ open, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabKey>(user ? 'history' : 'videos');

  const [history, setHistory] = useState<{ id: string; query: string; bookmarked?: boolean }[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [music, setMusic] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const TABS: { key: TabKey; label: string; icon: any; authOnly?: boolean }[] = [
    { key: 'history', label: 'History', icon: Clock, authOnly: true },
    { key: 'videos', label: 'Videos', icon: Video },
    { key: 'people', label: 'People', icon: Users },
    { key: 'products', label: 'Products', icon: ShoppingBag },
    { key: 'music', label: 'Music', icon: Music2 },
  ].filter(t => !t.authOnly || !!user) as any;

  useEffect(() => {
    if (!open) return;
    loadAll();
  }, [open]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [
        // trending videos (posts with media, ordered by views)
        supabase.from('posts').select('id, title, media_urls, thumbnail_url, media_type, view_count, likes_count, user_id')
          .eq('status', 'approved').not('media_urls', 'eq', '{}').order('view_count', { ascending: false }).limit(18),
        // trending people
        supabase.from('user_profiles').select('id, username, avatar_url, vip, follower_count')
          .order('follower_count', { ascending: false }).limit(12),
        // trending products
        supabase.from('marketplace_products').select('id, title, price_ngn, images, seller_user_id').limit(12),
        // music tracks
        supabase.from('music_tracks').select('id, title, artist_name, cover_url, usage_count').order('usage_count', { ascending: false }).limit(12),
      ];
      if (user) {
        promises.unshift(
          supabase.from('saved_searches').select('id, query, bookmarked').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30)
        );
      }
      const results = await Promise.all(promises);
      let i = 0;
      if (user) { setHistory((results[i++].data as any) || []); }
      setVideos((results[i++].data as any) || []);
      setPeople((results[i++].data as any) || []);
      setProducts((results[i++].data as any) || []);
      setMusic((results[i++].data as any) || []);
    } finally {
      setLoading(false);
    }
  };

  const submit = (q: string) => {
    const term = q.trim();
    if (!term) return;
    if (user) {
      supabase.from('saved_searches').insert({ user_id: user.id, query: term }).then(() => {});
      supabase.rpc('track_search', { search_keyword: term }).then(() => {});
    }
    navigate(`/explore?q=${encodeURIComponent(term)}`);
    onClose();
  };

  const removeHistory = async (id: string) => {
    await supabase.from('saved_searches').delete().eq('id', id);
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  const toggleBookmark = async (id: string, current: boolean) => {
    await supabase.from('saved_searches').update({ bookmarked: !current }).eq('id', id);
    setHistory(prev => prev.map(h => h.id === id ? { ...h, bookmarked: !current } : h));
  };

  // Swipe between tabs
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const swipeStart = (e: React.TouchEvent) => { const t = e.touches[0]; swipeRef.current = { x: t.clientX, y: t.clientY }; };
  const swipeEnd = (e: React.TouchEvent) => {
    const s = swipeRef.current; swipeRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x; const dy = t.clientY - s.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    const idx = TABS.findIndex(x => x.key === tab);
    if (dx < 0 && idx < TABS.length - 1) setTab(TABS[idx + 1].key);
    if (dx > 0 && idx > 0) setTab(TABS[idx - 1].key);
  };

  if (!open) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-background"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="max-w-[480px] mx-auto h-full flex flex-col">
        {/* Search bar */}
        <div className="p-3 flex items-center gap-2 border-b border-border">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit(query)}
              placeholder="Search videos, people, products, music…"
              className="pl-9 h-10 bg-muted/50 border-border"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex-1 flex flex-col overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide px-3 pt-2">
            <TabsList className="inline-flex w-max gap-1 bg-muted/50 p-1">
              {TABS.map(({ key, label, icon: Icon }) => (
                <TabsTrigger key={key} value={key} className="whitespace-nowrap text-xs">
                  <Icon className="w-3.5 h-3.5 mr-1" />{label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto" onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
            {user && (
              <TabsContent value="history" className="p-3 space-y-1 mt-0">
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No searches yet</p>
                ) : history.map(h => (
                  <div key={h.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                    <button onClick={() => submit(h.query)} className="flex items-center gap-2 flex-1 text-left">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm">{h.query}</span>
                    </button>
                    <button onClick={() => toggleBookmark(h.id, !!h.bookmarked)} className="p-1.5 text-muted-foreground hover:text-primary" title="Bookmark">
                      <Bookmark className={`w-4 h-4 ${h.bookmarked ? 'fill-primary text-primary' : ''}`} />
                    </button>
                    <button onClick={() => removeHistory(h.id)} className="p-1.5 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </TabsContent>
            )}

            <TabsContent value="videos" className="p-3 mt-0">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Flame className="w-3.5 h-3.5" /> Trending videos</h3>
              <div className="grid grid-cols-3 gap-2">
                {videos.map(v => (
                  <button key={v.id} onClick={() => { navigate(`/?post=${v.id}`); onClose(); }} className="aspect-[9/16] rounded-lg overflow-hidden bg-muted relative text-left">
                    <MediaThumb url={v.media_urls?.[0]} thumbnailUrl={v.thumbnail_url} mediaType={v.media_type} alt={v.title} className="w-full h-full" />
                    <div className="absolute bottom-1 left-1 flex items-center gap-1 text-white text-[10px] bg-black/40 px-1 rounded">
                      <Eye className="w-3 h-3" /> {v.view_count || 0}
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="people" className="p-3 space-y-2 mt-0">
              {people.map(p => (
                <button key={p.id} onClick={() => { navigate(`/profile/${p.id}`); onClose(); }} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-left">
                  <Avatar className="w-10 h-10"><AvatarImage src={p.avatar_url || ''} /><AvatarFallback>{p.username?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">@{p.username}</p>
                      {p.vip && <Badge variant="secondary" className="text-[9px] bg-yellow-400 text-black h-4">VIP</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{p.follower_count || 0} followers</p>
                  </div>
                </button>
              ))}
            </TabsContent>

            <TabsContent value="products" className="p-3 mt-0">
              <div className="grid grid-cols-2 gap-2">
                {products.map(pr => (
                  <button key={pr.id} onClick={() => { navigate(`/marketplace?product=${pr.id}`); onClose(); }} className="rounded-lg overflow-hidden bg-muted text-left">
                    <div className="aspect-square overflow-hidden bg-muted">
                      {pr.images?.[0] ? <img src={pr.images[0]} alt={pr.title} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20" />}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold line-clamp-1">{pr.title}</p>
                      <p className="text-xs text-primary font-bold">₦{(pr.price_ngn || 0).toLocaleString()}</p>
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="music" className="p-3 space-y-2 mt-0">
              {music.map(m => (
                <button key={m.id} onClick={() => { navigate(`/?sound=${m.id}`); onClose(); }} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-left">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                    {m.cover_url ? <img src={m.cover_url} className="w-full h-full object-cover" /> : <Music2 className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.artist_name} · {m.usage_count || 0} uses</p>
                  </div>
                </button>
              ))}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </motion.div>
  );
};

export default SearchOverlayV2;
