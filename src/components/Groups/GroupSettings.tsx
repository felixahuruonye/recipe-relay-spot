import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Settings, Save, Users, Crown, Copy, QrCode, UserMinus, 
  Shield, DollarSign, Clock, BarChart3, Trash2, LogOut
} from 'lucide-react';

interface GroupSettingsProps {
  groupId: string;
  group: any;
  isOwner: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

interface GroupMember {
  id: string;
  user_id: string;
  role: string;
  status: string;
  user_profiles?: {
    username: string;
    avatar_url: string;
  };
}

export const GroupSettings: React.FC<GroupSettingsProps> = ({ groupId, group, isOwner, onClose, onUpdate }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [name, setName] = useState(group.name || '');
  const [description, setDescription] = useState(group.description || '');
  const [groupType, setGroupType] = useState(group.group_type || 'public');
  const [entryFee, setEntryFee] = useState(group.entry_fee_stars?.toString() || '0');
  const [slowMode, setSlowMode] = useState('off');
  const [messagePrice, setMessagePrice] = useState('0');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pendingMembers, setPendingMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsUnlocked, setAnalyticsUnlocked] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    loadMembers();
  }, [groupId]);

  // Realtime member updates
  useEffect(() => {
    const channel = supabase
      .channel(`group-members-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` }, () => {
        loadMembers();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [groupId]);

  const loadMembers = async () => {
    const { data } = await supabase
      .from('group_members')
      .select(`
        id, user_id, role, status,
        user_profiles:user_id (username, avatar_url)
      `)
      .eq('group_id', groupId);

    if (data) {
      const active = data.filter(m => m.status === 'active');
      const pending = data.filter(m => m.status === 'pending');
      setMembers(active as any);
      setPendingMembers(pending as any);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    
    const { error } = await supabase
      .from('groups')
      .update({
        name: name.trim(),
        description: description.trim(),
        group_type: groupType,
        entry_fee_stars: parseInt(entryFee) || 0
      })
      .eq('id', groupId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Group settings updated' });
      onUpdate();
    }
    setLoading(false);
  };

  const inviteLink = `${window.location.origin}/groups?join=${groupId}`;

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast({ title: 'Copied!', description: 'Invite link copied to clipboard' });
  };

  const approveMember = async (memberId: string) => {
    await supabase
      .from('group_members')
      .update({ status: 'active' })
      .eq('id', memberId);

    toast({ title: 'Approved', description: 'Member has been approved' });
    loadMembers();
  };

  const removeMember = async (memberId: string) => {
    await supabase
      .from('group_members')
      .delete()
      .eq('id', memberId);

    toast({ title: 'Removed', description: 'Member has been removed' });
    loadMembers();
  };

  const makeAdmin = async (memberId: string) => {
    await supabase
      .from('group_members')
      .update({ role: 'admin' })
      .eq('id', memberId);

    toast({ title: 'Updated', description: 'Member is now an admin' });
    loadMembers();
  };

  const unlockAnalytics = async () => {
    if (!user) return;

    const { data, error } = await supabase.rpc('spend_stars' as any, {
      p_amount: 50,
      p_type: 'group_analytics_unlock',
      p_meta: { group_id: groupId }
    } as any);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    if (data && (data as any).success === false) {
      toast({ title: 'Insufficient Stars', description: (data as any).error || 'Not enough stars', variant: 'destructive' });
      return;
    }

    setAnalyticsUnlocked(true);
    setShowAnalytics(true);
    toast({ title: 'Unlocked!', description: 'Analytics unlocked for 20 days' });
  };

  const deleteGroup = async () => {
    const confirmed = window.confirm('Are you sure you want to permanently DELETE this group? This cannot be undone.');
    if (!confirmed) return;

    try {
      const { data, error } = await supabase.rpc('delete_own_group' as any, { p_group_id: groupId } as any);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }

      if (data && (data as any).success === false) {
        toast({ title: 'Error', description: (data as any).error || 'Could not delete group', variant: 'destructive' });
        return;
      }

      toast({ title: 'Deleted', description: 'Group has been permanently deleted' });
      onUpdate();
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const leaveGroup = async () => {
    if (!user) return;
    
    await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', user.id);

    toast({ title: 'Left Group', description: 'You have left the group' });
    onUpdate();
    onClose();
  };

  return (
    <div className="p-4 space-y-6 max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Group Settings
        </h2>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>

      {isOwner && (
        <>
          {/* Basic Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Group Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} maxLength={50} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={200} />
              </div>
              <div>
                <Label>Group Type</Label>
                <Select value={groupType} onValueChange={setGroupType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public (Anyone can join)</SelectItem>
                    <SelectItem value="private">Private (Invite only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={saveSettings} disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </CardContent>
          </Card>

          {/* Monetization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Monetization
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Entry Fee (Stars)</Label>
                <Select value={entryFee} onValueChange={setEntryFee}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Free</SelectItem>
                    {[5,10,25,50,100,500,1000,5000,10000,50000,100000,500000].map(v => (
                      <SelectItem key={v} value={v.toString()}>{v.toLocaleString()} Stars</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">You earn 80% of entry fees</p>
              </div>
              <div>
                <Label>Message Fee (Stars per message)</Label>
                <Select value={messagePrice} onValueChange={setMessagePrice}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Free</SelectItem>
                    {[...Array(20)].map((_, i) => (
                      <SelectItem key={i+1} value={(i+1).toString()}>{i+1} Star(s)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Slow Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Slow Mode
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={slowMode} onValueChange={setSlowMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="10s">10 seconds</SelectItem>
                  <SelectItem value="30s">30 seconds</SelectItem>
                  <SelectItem value="1m">1 minute</SelectItem>
                  <SelectItem value="5m">5 minutes</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Invite Link */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Invite Link</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button onClick={copyInviteLink} className="flex-1">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Invite Link
                </Button>
                <Button variant="outline" onClick={() => setShowQR(!showQR)}>
                  <QrCode className="w-4 h-4" />
                </Button>
              </div>
              {showQR && (
                <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteLink)}`} 
                    alt="QR Code"
                    className="w-48 h-48"
                  />
                  <p className="text-xs text-black text-center break-all">{inviteLink}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Members Management */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                Members ({members.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-60 overflow-y-auto">
              {members.map(member => (
                <div key={member.id} className="flex items-center justify-between p-2 bg-muted rounded">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={member.user_profiles?.avatar_url} />
                      <AvatarFallback>{member.user_profiles?.username?.[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{member.user_profiles?.username}</span>
                    {member.role === 'owner' && <Badge><Crown className="w-3 h-3" /></Badge>}
                    {member.role === 'admin' && <Badge variant="secondary"><Shield className="w-3 h-3" /></Badge>}
                  </div>
                  {member.role !== 'owner' && (
                    <div className="flex gap-1">
                      {member.role !== 'admin' && (
                        <Button size="sm" variant="outline" onClick={() => makeAdmin(member.id)}>
                          Admin
                        </Button>
                      )}
                      <Button size="sm" variant="destructive" onClick={() => removeMember(member.id)}>
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Pending Members */}
          {pendingMembers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pending Requests ({pendingMembers.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-2 bg-muted rounded">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={member.user_profiles?.avatar_url} />
                        <AvatarFallback>{member.user_profiles?.username?.[0]}</AvatarFallback>
                      </Avatar>
                      <span>{member.user_profiles?.username}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => approveMember(member.id)}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => removeMember(member.id)}>Reject</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Analytics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsUnlocked ? (
                <div className="space-y-2">
                  <div className="flex justify-between p-2 bg-muted rounded">
                    <span>Total Members</span>
                    <span className="font-bold">{members.length}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-muted-foreground mb-3">Unlock analytics for 50 Stars (20 days access)</p>
                  <Button onClick={unlockAnalytics}>
                    <DollarSign className="w-4 h-4 mr-2" />
                    Unlock Analytics (50 Stars)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="destructive" className="w-full" onClick={deleteGroup}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Group Permanently
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Leave Group (for non-owners) */}
      {!isOwner && (
        <Card>
          <CardContent className="pt-6">
            <Button variant="destructive" className="w-full" onClick={leaveGroup}>
              <LogOut className="w-4 h-4 mr-2" />
              Leave Group
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
