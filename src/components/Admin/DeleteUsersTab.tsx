import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Search, AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface UserProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  is_vip: boolean | null;
  star_balance: number | null;
  wallet_balance: number | null;
}

export const DeleteUsersTab: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<UserProfile | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
    const channel = supabase
      .channel('admin-users-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, () => {
        fetchUsers();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, username, full_name, avatar_url, created_at, is_vip, star_balance, wallet_balance')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  };

  const deleteUser = async (userId: string) => {
    setDeletingId(userId);
    try {
      const { data, error } = await supabase.rpc('admin_delete_user', {
        p_target_user_id: userId,
      });

      if (error) throw error;

      const result = data as any;
      if (result?.success === false) {
        throw new Error(result.error || 'Deletion failed');
      }

      toast({ title: 'User Deleted', description: 'User and all their data have been permanently removed.' });
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      console.error('Delete user error:', err);
      toast({ title: 'Deletion Failed', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
      setConfirmUser(null);
    }
  };

  const filtered = users.filter(
    (u) =>
      u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.id.includes(searchQuery)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-destructive" />
          Delete Users ({users.length})
        </CardTitle>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by username, name, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No users found.</p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filtered.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="w-10 h-10 shrink-0">
                    <AvatarImage src={u.avatar_url || ''} />
                    <AvatarFallback>{u.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{u.username}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.full_name || 'No name'} · {new Date(u.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {u.is_vip && <Badge variant="secondary" className="text-xs">VIP</Badge>}
                      <Badge variant="outline" className="text-xs">⭐ {u.star_balance ?? 0}</Badge>
                      <Badge variant="outline" className="text-xs">₦{u.wallet_balance ?? 0}</Badge>
                    </div>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletingId === u.id}
                  onClick={() => setConfirmUser(u)}
                >
                  {deletingId === u.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!confirmUser} onOpenChange={() => setConfirmUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete User Permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{confirmUser?.username}</strong> from Supabase
              authentication and remove ALL their data (posts, messages, groups, balances, etc.).
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmUser && deleteUser(confirmUser.id)}
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
