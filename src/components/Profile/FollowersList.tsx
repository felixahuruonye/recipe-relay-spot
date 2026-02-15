import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface FollowUser {
  id: string;
  username: string;
  avatar_url: string | null;
  vip: boolean | null;
}

interface FollowersListProps {
  userId: string;
  type: 'followers' | 'following';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
}

export const FollowersList: React.FC<FollowersListProps> = ({ userId, type, open, onOpenChange, count }) => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) loadUsers();
  }, [open, userId, type]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      if (type === 'followers') {
        const { data } = await supabase
          .from('followers')
          .select('follower_id')
          .eq('following_id', userId);

        if (data && data.length > 0) {
          const ids = data.map(f => f.follower_id);
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, username, avatar_url, vip')
            .in('id', ids);
          setUsers(profiles || []);
        } else {
          setUsers([]);
        }
      } else {
        const { data } = await supabase
          .from('followers')
          .select('following_id')
          .eq('follower_id', userId);

        if (data && data.length > 0) {
          const ids = data.map(f => f.following_id);
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, username, avatar_url, vip')
            .in('id', ids);
          setUsers(profiles || []);
        } else {
          setUsers([]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = search
    ? users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            {type === 'followers' ? `Followers (${count})` : `Following (${count})`}
          </DialogTitle>
        </DialogHeader>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="space-y-2 overflow-y-auto max-h-[55vh]">
          {loading ? (
            <p className="text-center text-muted-foreground py-4">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </p>
          ) : (
            filtered.map(u => (
              <div
                key={u.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                onClick={() => { onOpenChange(false); navigate(`/profile/${u.id}`); }}
              >
                <Avatar className="w-10 h-10">
                  <AvatarImage src={u.avatar_url || ''} />
                  <AvatarFallback>{u.username[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-1">
                  <span className="font-medium text-sm">{u.username}</span>
                  {u.vip && <Crown className="w-3 h-3 text-yellow-500" />}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
