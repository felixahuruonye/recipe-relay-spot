import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Crown, Star, Link as LinkIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserProfile {
  id: string;
  username: string;
  avatar_url: string;
  vip: boolean;
  vip_expires_at: string | null;
  star_balance: number;
}

export const VIPManager: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [paystackUrl30, setPaystackUrl30] = useState('');
  const [paystackUrl60, setPaystackUrl60] = useState('');

  useEffect(() => {
    loadUsers();
    loadPaystackUrls();
    const channel = supabase
      .channel('vip-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, () => loadUsers())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadUsers = async () => {
    const { data } = await supabase.from('user_profiles').select('id, username, avatar_url, vip, vip_expires_at, star_balance').order('vip', { ascending: false });
    setUsers(data || []);
    setLoading(false);
  };

  const loadPaystackUrls = async () => {
    const { data } = await supabase.from('admin_settings').select('setting_key, setting_value').in('setting_key', ['vip_30_days_url', 'vip_60_days_url']);
    if (data) {
      data.forEach(s => {
        if (s.setting_key === 'vip_30_days_url') setPaystackUrl30(s.setting_value || '');
        if (s.setting_key === 'vip_60_days_url') setPaystackUrl60(s.setting_value || '');
      });
    }
  };

  const savePaystackUrls = async () => {
    for (const [key, value] of [['vip_30_days_url', paystackUrl30], ['vip_60_days_url', paystackUrl60]]) {
      const { data: existing } = await supabase.from('admin_settings').select('id').eq('setting_key', key).maybeSingle();
      if (existing) {
        await supabase.from('admin_settings').update({ setting_value: value }).eq('setting_key', key);
      } else {
        await supabase.from('admin_settings').insert({ setting_key: key, setting_value: value, setting_type: 'url', description: `Paystack payment link for VIP ${key.includes('30') ? '30' : '60'} days` });
      }
    }
    toast({ title: 'Saved', description: 'Paystack payment URLs updated.' });
  };

  const updateVIP = async (userId: string, isVip: boolean, days: number = 30) => {
    const expiresAt = isVip ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
    const { error } = await supabase.from('user_profiles').update({
      vip: isVip, vip_started_at: isVip ? new Date().toISOString() : null, vip_expires_at: expiresAt,
    }).eq('id', userId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update VIP status', variant: 'destructive' });
    } else {
      toast({ title: 'VIP Updated', description: `VIP status ${isVip ? 'granted' : 'removed'}` });
      if (isVip) {
        await supabase.from('user_notifications').insert({
          user_id: userId, title: '🌟 VIP Status Activated!',
          message: `Your VIP membership is now active for ${days} days. Enjoy exclusive features!`,
          type: 'success', notification_category: 'admin',
        });
      }
    }
  };

  const updateStarBalance = async (userId: string, newBalance: number) => {
    const { error } = await supabase.from('user_profiles').update({ star_balance: newBalance }).eq('id', userId);
    if (error) toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    else toast({ title: 'Stars Updated' });
  };

  const filteredUsers = users.filter(u => u.username?.toLowerCase().includes(searchTerm.toLowerCase()));

  const getDaysRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return 0;
    return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="space-y-4">
      {/* Paystack Config */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><LinkIcon className="w-5 h-5" /> Paystack Payment Links</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium">30 Days VIP - Paystack URL</label>
            <Input value={paystackUrl30} onChange={e => setPaystackUrl30(e.target.value)} placeholder="https://paystack.com/pay/..." />
          </div>
          <div>
            <label className="text-sm font-medium">60 Days VIP - Paystack URL</label>
            <Input value={paystackUrl60} onChange={e => setPaystackUrl60(e.target.value)} placeholder="https://paystack.com/pay/..." />
          </div>
          <Button onClick={savePaystackUrls}>Save Payment Links</Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center"><Crown className="w-5 h-5 mr-2 text-yellow-500" /> VIP & Star Management</h2>
        <Input placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="max-w-xs" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredUsers.map((u) => (
          <Card key={u.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-3">
                <Avatar className="w-12 h-12"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.username?.[0]}</AvatarFallback></Avatar>
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center">{u.username}{u.vip && <Crown className="w-4 h-4 ml-2 text-yellow-500" />}</CardTitle>
                  {u.vip && u.vip_expires_at && <p className="text-xs text-muted-foreground">{getDaysRemaining(u.vip_expires_at)} days remaining</p>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1"><Star className="w-4 h-4 text-yellow-500" /><span className="text-sm font-medium">{u.star_balance || 0}</span></div>
                <Input type="number" className="w-24 h-8" defaultValue={u.star_balance || 0} onBlur={e => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v !== u.star_balance) updateStarBalance(u.id, v);
                }} />
              </div>
              <div className="flex items-center space-x-2">
                {u.vip ? (
                  <Button variant="destructive" size="sm" className="flex-1" onClick={() => updateVIP(u.id, false)}>Remove VIP</Button>
                ) : (
                  <>
                    <Button variant="default" size="sm" className="flex-1" onClick={() => updateVIP(u.id, true, 30)}>30 Days</Button>
                    <Button variant="default" size="sm" className="flex-1" onClick={() => updateVIP(u.id, true, 90)}>90 Days</Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
