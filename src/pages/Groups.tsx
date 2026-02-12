import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Users, Lock, Globe, Search, Crown, Star, Settings, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { GroupChat } from '@/components/Groups/GroupChat';
import { GroupSettings } from '@/components/Groups/GroupSettings';

interface Group {
  id: string;
  name: string;
  description: string;
  group_type: 'public' | 'private';
  avatar_url: string;
  member_count: number;
  owner_id: string;
  created_at: string;
  is_suspended: boolean | null;
  entry_fee_stars?: number;
}

interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'banned';
  joined_at: string;
}

const Groups = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [userStars, setUserStars] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupType, setNewGroupType] = useState<'public' | 'private'>('public');
  const [newGroupFee, setNewGroupFee] = useState('0');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchGroups();
      fetchMyGroups();
      fetchUserStars();
    }
  }, [user]);

  const fetchUserStars = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('star_balance')
      .eq('id', user.id)
      .single();
    setUserStars(data?.star_balance || 0);
  };

  const fetchGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        // new rows may have is_suspended = NULL; treat as not suspended
        .or('is_suspended.is.null,is_suspended.eq.false')
        .order('member_count', { ascending: false });

      if (error) throw error;
      setGroups(
        (data || []).map((group: any) => ({
          ...group,
          member_count: group.member_count ?? 0,
          group_type: group.group_type as 'public' | 'private',
        }))
      );
    } catch (error) {
      console.error('Error fetching groups:', error);
      toast({
        title: "Error",
        description: "Failed to load groups",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Realtime refresh for groups + membership changes (so lists update without refresh)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('groups-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, () => {
        fetchGroups();
        fetchMyGroups();
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `user_id=eq.${user.id}` },
        () => {
          fetchMyGroups();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const fetchMyGroups = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('group_members')
        .select(`
          groups (*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) throw error;
      
      const userGroups = data?.map(item => item.groups).filter(Boolean) || [];
      setMyGroups(userGroups as Group[]);
    } catch (error) {
      console.error('Error fetching user groups:', error);
    }
  };

  const createGroup = async () => {
    if (!user || !newGroupName.trim()) return;

    try {
      const entryFee = parseInt(newGroupFee) || 0;

      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: newGroupName.trim(),
          description: newGroupDescription.trim(),
          owner_id: user.id,
          group_type: newGroupType,
          entry_fee_stars: entryFee
        })
        .select()
        .single();

      if (groupError) throw groupError;

      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: group.id,
          user_id: user.id,
          role: 'owner',
          status: 'active'
        });

      if (memberError) throw memberError;

      toast({
        title: "Group created!",
        description: `${newGroupName} has been created successfully.`
      });

      setNewGroupName('');
      setNewGroupDescription('');
      setNewGroupType('public');
      setNewGroupFee('0');
      setShowCreateDialog(false);
      
      fetchGroups();
      fetchMyGroups();
    } catch (error) {
      console.error('Error creating group:', error);
      toast({
        title: "Error",
        description: "Failed to create group. Please try again.",
        variant: "destructive"
      });
    }
  };

  const joinGroup = async (group: Group) => {
    if (!user) return;

    const entryFee = group.entry_fee_stars || 0;

    // Check if user has enough stars
    if (entryFee > 0 && userStars < entryFee) {
      toast({
        title: "Insufficient Stars",
        description: `You need ${entryFee}⭐ to join this group. You have ${userStars}⭐.`,
        variant: "destructive"
      });
      return;
    }

    try {
      const status = group.group_type === 'public' ? 'active' : 'pending';

      // IMPORTANT:
      // Never update protected balance fields (star_balance / wallet_balance) from the client.
      // For public groups, use the SECURITY DEFINER RPC that applies fees/earnings safely.
      if (group.group_type === 'public') {
        const { data, error } = await supabase.rpc('join_group_with_fee', {
          p_group_id: group.id,
          p_user_id: user.id,
          p_entry_fee: entryFee
        });

        if (error) throw error;
        if (data && (data as any).success === false) {
          toast({
            title: 'Unable to join',
            description: (data as any).error || 'Failed to join group',
            variant: 'destructive'
          });
          return;
        }
      } else {
        // Private groups: create a pending membership request (fee is not charged here).
        const { error } = await supabase
          .from('group_members')
          .insert({
            group_id: group.id,
            user_id: user.id,
            status
          });

        if (error) {
          if (error.code === '23505') {
            toast({
              title: 'Already requested',
              description: "You're already a member (or have a pending request) for this group.",
              variant: 'destructive'
            });
            return;
          }
          throw error;
        }
      }

      toast({
        title: group.group_type === 'public' ? "Joined group!" : "Request sent!",
        description: group.group_type === 'public' 
          ? `You've successfully joined the group${entryFee > 0 ? ` (${entryFee}⭐ paid)` : ''}.` 
          : "Your join request has been sent to the group owner."
      });

      await Promise.all([fetchGroups(), fetchMyGroups(), fetchUserStars()]);
    } catch (error) {
      console.error('Error joining group:', error);
      toast({
        title: "Error",
        description: (error as any)?.message || "Failed to join group. Please try again.",
        variant: "destructive"
      });
    }
  };

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isGroupMember = (groupId: string) => {
    return myGroups.some(group => group.id === groupId);
  };

  const isGroupOwner = (group: Group) => {
    return group.owner_id === user?.id;
  };

  if (showSettings && selectedGroup) {
    return (
      <GroupSettings
        groupId={selectedGroup.id}
        group={selectedGroup}
        isOwner={selectedGroup.owner_id === user?.id}
        onClose={() => {
          setShowSettings(false);
          setSelectedGroup(null);
        }}
        onUpdate={() => {
          fetchGroups();
          fetchMyGroups();
        }}
      />
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          <p className="text-muted-foreground">Join communities and connect with others</p>
          <Badge variant="outline" className="mt-1">
            <Star className="w-3 h-3 mr-1" />
            {userStars} Stars
          </Badge>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Group Name *</label>
                <Input
                  placeholder="Enter group name"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  maxLength={50}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Describe your group (optional)"
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  maxLength={200}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Group Type</label>
                <div className="flex space-x-4 mt-2">
                  <Button
                    type="button"
                    variant={newGroupType === 'public' ? 'default' : 'outline'}
                    onClick={() => setNewGroupType('public')}
                    className="flex-1"
                  >
                    <Globe className="w-4 h-4 mr-2" />
                    Public
                  </Button>
                  <Button
                    type="button"
                    variant={newGroupType === 'private' ? 'default' : 'outline'}
                    onClick={() => setNewGroupType('private')}
                    className="flex-1"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Private
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Entry Fee (Stars)</label>
                <Input
                  type="number"
                  placeholder="0 for free"
                  value={newGroupFee}
                  onChange={(e) => setNewGroupFee(e.target.value)}
                  min="0"
                  max="500000"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  You earn 80% of entry fees. Platform takes 20%.
                </p>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={createGroup} disabled={!newGroupName.trim()}>
                  Create Group
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search groups..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="discover" className="space-y-4">
        <TabsList>
          <TabsTrigger value="discover">Discover Groups</TabsTrigger>
          <TabsTrigger value="my-groups">My Groups ({myGroups.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="discover">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-6 bg-muted rounded"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-20 bg-muted rounded"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGroups.map((group) => (
                <Card key={group.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={group.avatar_url} />
                          <AvatarFallback>{group.name[0]}</AvatarFallback>
                        </Avatar>
                        <CardTitle className="text-lg">{group.name}</CardTitle>
                      </div>
                      {group.group_type === 'private' ? (
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Globe className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {group.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {group.description}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>{group.member_count} members</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {group.entry_fee_stars && group.entry_fee_stars > 0 ? (
                          <Badge variant="secondary">
                            <Star className="w-3 h-3 mr-1" />
                            {group.entry_fee_stars}
                          </Badge>
                        ) : null}
                        <Badge variant={group.group_type === 'public' ? 'default' : 'secondary'}>
                          {group.group_type}
                        </Badge>
                      </div>
                    </div>
                    
                    <Button
                      className="w-full"
                      onClick={() => joinGroup(group)}
                      disabled={isGroupMember(group.id)}
                      variant={isGroupMember(group.id) ? 'outline' : 'default'}
                    >
                      {isGroupMember(group.id) 
                        ? 'Already Joined' 
                        : group.entry_fee_stars && group.entry_fee_stars > 0
                        ? `Join (${group.entry_fee_stars}⭐)`
                        : group.group_type === 'public' 
                        ? 'Join Group' 
                        : 'Request to Join'
                      }
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && filteredGroups.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No groups found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'Try adjusting your search terms' : 'Be the first to create a group!'}
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="my-groups">
          {myGroups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myGroups.map((group) => (
                <Card key={group.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={group.avatar_url} />
                          <AvatarFallback>{group.name[0]}</AvatarFallback>
                        </Avatar>
                        <CardTitle className="text-lg">{group.name}</CardTitle>
                      </div>
                      <div className="flex items-center space-x-1">
                        {isGroupOwner(group) && (
                          <Crown className="w-4 h-4 text-yellow-500" />
                        )}
                        {group.group_type === 'private' ? (
                          <Lock className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <Globe className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {group.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {group.description}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>{group.member_count} members</span>
                      </div>
                      
                      <Badge variant={group.group_type === 'public' ? 'default' : 'secondary'}>
                        {group.group_type}
                      </Badge>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => setSelectedGroup(group)}>
                        Open Chat
                      </Button>
                      {isGroupOwner(group) && (
                        <>
                          <Button 
                            variant="outline" 
                            size="icon"
                            onClick={() => {
                              setSelectedGroup(group);
                              setShowSettings(true);
                            }}
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={async () => {
                              if (!confirm(`Delete group "${group.name}"? This cannot be undone.`)) return;
                              const { data, error } = await supabase.rpc('delete_own_group', { p_group_id: group.id });
                              if (error) {
                                toast({ title: 'Error', description: error.message, variant: 'destructive' });
                              } else {
                                toast({ title: 'Group Deleted', description: `"${group.name}" has been deleted.` });
                                fetchGroups();
                                fetchMyGroups();
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No groups yet</h3>
              <p className="text-muted-foreground">Join or create groups to get started!</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {selectedGroup && !showSettings && (
        <div className="fixed inset-0 bg-background z-50">
          <GroupChat
            groupId={selectedGroup.id}
            groupName={selectedGroup.name}
            onBack={() => setSelectedGroup(null)}
          />
        </div>
      )}
    </div>
  );
};

export default Groups;