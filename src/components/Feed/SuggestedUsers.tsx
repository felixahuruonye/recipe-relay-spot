import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { UserPlus, ChevronRight, Search, X, Crown } from 'lucide-react';
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
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadSuggestions();
  }, [user]);

  const loadSuggestions = async () => {
    if (!user) return;

    // Get who we already follow
    const { data: following } = await supabase
      .from('followers')
      .select('following_id')
      .eq('follower_id', user.id);

    const followingIds = new Set(following?.map(f => f.following_id) || []);
    setFollowingSet(followingIds);

    // Get newest users we don't follow
    const { data: users } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url, vip, full_name')
      .neq('id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const filtered = (users || []).filter(u => !followingIds.has(u.id));
    setSuggestions(filtered.slice(0, 10));
    setAllUsers(filtered);
    setLoading(false);
  };

  const handleFollow = async (targetId: string) => {
    if (!user) return;
    try {
      if (followingSet.has(targetId)) {
        await supabase.from('followers').delete()
          .eq('follower_id', user.id).eq('following_id', targetId);
        setFollowingSet(prev => { const n = new Set(prev); n.delete(targetId); return n; });
        toast({ title: 'Unfollowed' });
      } else {
        await supabase.from('followers').insert({ follower_id: user.id, following_id: targetId });
        setFollowingSet(prev => new Set(prev).add(targetId));
        toast({ title: 'Following!' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const filteredAll = searchQuery
    ? allUsers.filter(u =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allUsers;

  if (loading || suggestions.length === 0) return null;

  return (
    <>
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            People you may know
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="flex gap-3 pb-2">
              {suggestions.slice(0, 10).map(u => (
                <div key={u.id} className="flex flex-col items-center gap-1 min-w-[80px]">
                  <Avatar
                    className="w-14 h-14 cursor-pointer border-2 border-primary/30"
                    onClick={() => navigate(`/profile/${u.id}`)}
                  >
                    <AvatarImage src={u.avatar_url || ''} />
                    <AvatarFallback>{u.username[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span
                    className="text-xs font-medium truncate max-w-[70px] cursor-pointer hover:underline"
                    onClick={() => navigate(`/profile/${u.id}`)}
                  >
                    {u.username}
                  </span>
                  {u.vip && <Crown className="w-3 h-3 text-yellow-500" />}
                  <Button
                    size="sm"
                    variant={followingSet.has(u.id) ? 'outline' : 'default'}
                    className="h-6 text-xs px-2"
                    onClick={() => handleFollow(u.id)}
                  >
                    {followingSet.has(u.id) ? 'Following' : 'Follow'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
          {allUsers.length > 10 && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll(true)}>
              View More <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Discover People
            </DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[55vh]">
            {filteredAll.map(u => (
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
                    {u.full_name && <span className="text-xs text-muted-foreground">{u.full_name}</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={followingSet.has(u.id) ? 'outline' : 'default'}
                  onClick={() => handleFollow(u.id)}
                >
                  {followingSet.has(u.id) ? 'Following' : 'Follow'}
                </Button>
              </div>
            ))}
            {filteredAll.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No users found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
