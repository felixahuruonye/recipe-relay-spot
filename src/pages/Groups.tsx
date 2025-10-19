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
import { Plus, Users, Lock, Globe, Search, Crown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { GroupChat } from '@/components/Groups/GroupChat';

interface Group {
  id: string;
  name: string;
  description: string;
  group_type: 'public' | 'private';
  avatar_url: string;
  member_count: number;
  owner_id: string;
  created_at: string;
  is_suspended: boolean;
}

interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'banned';
  joined_at: string;
  user_profiles?: {
    username: string;
    avatar_url: string;
    vip: boolean;
  };
}

const Groups = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupType, setNewGroupType] = useState<'public' | 'private'>('public');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchGroups();
      fetchMyGroups();
    }
  }, [user]);

  const fetchGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('is_suspended', false)
        .order('member_count', { ascending: false });

      if (error) throw error;
      setGroups((data || []).map(group => ({
        ...group,
        group_type: group.group_type as 'public' | 'private'
      })));
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
      // Create the group
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: newGroupName.trim(),
          description: newGroupDescription.trim(),
          owner_id: user.id,
          group_type: newGroupType
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add creator as group owner
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

      // Reset form and close dialog
      setNewGroupName('');
      setNewGroupDescription('');
      setNewGroupType('public');
      setShowCreateDialog(false);
      
      // Refresh groups
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

  const joinGroup = async (groupId: string, groupType: 'public' | 'private') => {
    if (!user) return;

    try {
      const status = groupType === 'public' ? 'active' : 'pending';
      
      const { error } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: user.id,
          status: status
        });

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          toast({
            title: "Already a member",
            description: "You're already a member of this group.",
            variant: "destructive"
          });
          return;
        }
        throw error;
      }

      toast({
        title: groupType === 'public' ? "Joined group!" : "Request sent!",
        description: groupType === 'public' 
          ? "You've successfully joined the group." 
          : "Your join request has been sent to the group owner."
      });

      fetchMyGroups();
    } catch (error) {
      console.error('Error joining group:', error);
      toast({
        title: "Error",
        description: "Failed to join group. Please try again.",
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

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          <p className="text-muted-foreground">Join communities and connect with others</p>
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
                      <CardTitle className="text-lg">{group.name}</CardTitle>
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
                      
                      <Badge variant={group.group_type === 'public' ? 'default' : 'secondary'}>
                        {group.group_type}
                      </Badge>
                    </div>
                    
                    <Button
                      className="w-full"
                      onClick={() => joinGroup(group.id, group.group_type)}
                      disabled={isGroupMember(group.id)}
                      variant={isGroupMember(group.id) ? 'outline' : 'default'}
                    >
                      {isGroupMember(group.id) 
                        ? 'Already Joined' 
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
                      <CardTitle className="text-lg">{group.name}</CardTitle>
                      <div className="flex items-center space-x-1">
                        {group.owner_id === user?.id && (
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
                    
                    <Button className="w-full" onClick={() => setSelectedGroup(group)}>
                      Open Chat
                    </Button>
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

      {selectedGroup && (
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