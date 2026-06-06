import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, ChevronRight, Search, Crown, X, Shuffle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface UserSuggestion {
  id: string;
  username: string;
  avatar_url: string | null;
  vip: boolean | null;
  full_name: string | null;
}

export const SuggestedUsers: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [allUsers, setAllUsers] = useState<UserSuggestion[]>([]);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followerSet, setFollowerSet] = useState<Set<string>>(new Set()); // users who follow me
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) loadSuggestions(); }, [user]);

  const loadSuggestions = async () => {
    if (!user) return;
    const [{ data: following }, { data: followers }] = await Promise.all([
      supabase.from('followers').select('following_id').eq('follower_id', user.id),
      supabase.from('followers').select('follower_id').eq('following_id', user.id),
    ]);
    const followingIds = new Set(following?.map((f: any) => f.following_id) || []);
    const followerIds = new Set(followers?.map((f: any) => f.follower_id) || []);
    setFollowingSet(followingIds);
    setFollowerSet(followerIds);

    const { data: users } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url, vip, full_name')
      .neq('id', user.id)
      .order('created_at', { ascending: false })
      .limit(500);

    const list = users || [];
    setAllUsers(list);
    // Prioritize: people who follow me but I don't follow back, then others not followed
    const followBacks = list.filter(u => followerIds.has(u.id) && !followingIds.has(u.id));
    const others = list.filter(u => !followerIds.has(u.id) && !followingIds.has(u.id));
    setSuggestions(shuffle([...followBacks, ...others]).slice(0, 12));
    setLoading(false);
  };

  const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

  const handleFollow = async (targetId: string) => {
    if (!user) return;
    try {
      if (followingSet.has(targetId)) {
        await supabase.from('followers').delete()
          .eq('follower_id', user.id).eq('following_id', targetId);
        setFollowingSet(prev => { const n = new Set(prev); n.delete(targetId); return n; });
      } else {
        await supabase.from('followers').insert({ follower_id: user.id, following_id: targetId });
        setFollowingSet(prev => new Set(prev).add(targetId));
        toast({ title: '✓ Following' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const dismiss = (id: string) => {
    setDismissed(prev => new Set(prev).add(id));
  };

  const visible = suggestions.filter(u => !dismissed.has(u.id));
  const filteredAll = searchQuery
    ? allUsers.filter(u =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allUsers;

  if (loading || visible.length === 0) return null;

  return (
    <>
      <div className="rounded-2xl border border-primary/20 bg-card/60 p-3 backdrop-blur">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            People you may know
          </h3>
          <button onClick={() => setSuggestions(shuffle(suggestions))} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary">
            <Shuffle className="w-3 h-3" /> Shuffle
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {visible.slice(0, 4).map(u => {
            const followsMe = followerSet.has(u.id);
            const iFollow = followingSet.has(u.id);
            return (
              <div key={u.id} className="relative rounded-xl bg-muted/40 border border-border p-3 flex flex-col items-center text-center">
                <button onClick={() => dismiss(u.id)} className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
                <Avatar
                  className="w-16 h-16 cursor-pointer ring-2 ring-primary/40 mb-2"
                  onClick={() => navigate(`/profile/${u.id}`)}
                >
                  <AvatarImage src={u.avatar_url || ''} />
                  <AvatarFallback className="text-lg">{u.username[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-xs font-semibold truncate max-w-[100px]" onClick={() => navigate(`/profile/${u.id}`)}>
                    {u.username}
                  </span>
                  {u.vip && <Crown className="w-3 h-3 text-yellow-500 shrink-0" />}
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  {followsMe ? 'Follows you' : 'Suggested for you'}
                </p>
                <Button
                  size="sm"
                  variant={iFollow ? 'outline' : 'default'}
                  className="w-full h-7 text-[11px] font-semibold"
                  onClick={() => handleFollow(u.id)}
                >
                  {iFollow ? 'Following' : followsMe ? 'Follow back' : 'Follow'}
                </Button>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-3 text-xs text-primary font-semibold flex items-center justify-center gap-1 hover:underline"
        >
          View More <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Discover People
            </DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[55vh]">
            {filteredAll.map(u => {
              const followsMe = followerSet.has(u.id);
              const iFollow = followingSet.has(u.id);
              return (
                <div key={u.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                  <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => { setShowAll(false); navigate(`/profile/${u.id}`); }}>
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={u.avatar_url || ''} />
                      <AvatarFallback>{u.username[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sm truncate">{u.username}</span>
                        {u.vip && <Crown className="w-3 h-3 text-yellow-500" />}
                      </div>
                      {followsMe && <span className="text-[10px] text-primary">Follows you</span>}
                    </div>
                  </div>
                  <Button size="sm" variant={iFollow ? 'outline' : 'default'} onClick={() => handleFollow(u.id)}>
                    {iFollow ? 'Following' : followsMe ? 'Follow back' : 'Follow'}
                  </Button>
                </div>
              );
            })}
            {filteredAll.length === 0 && <p className="text-center text-muted-foreground py-4">No users found</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
