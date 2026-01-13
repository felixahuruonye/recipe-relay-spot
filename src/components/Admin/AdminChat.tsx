import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const AdminChat: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      loadMessages();
      const channel = supabase
        .channel(`admin-chat-${selectedUser.id}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'private_messages',
          filter: `to_user_id=eq.${selectedUser.id}`
        }, loadMessages)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'private_messages',
          filter: `from_user_id=eq.${selectedUser.id}`
        }, loadMessages)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const filtered = users.filter(user => 
      user.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredUsers(filtered);
  }, [searchQuery, users]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadUsers = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .order('username');
    setUsers(data || []);
    setFilteredUsers(data || []);
  };

  const loadMessages = async () => {
    if (!selectedUser) return;
    
    // Get admin user ID (first admin)
    const { data: adminData } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    const adminId = adminData?.user_id;
    if (!adminId) return;

    // Load messages between admin and user from private_messages table
    const { data } = await supabase
      .from('private_messages')
      .select('*')
      .or(`and(from_user_id.eq.${adminId},to_user_id.eq.${selectedUser.id}),and(from_user_id.eq.${selectedUser.id},to_user_id.eq.${adminId})`)
      .order('created_at');
    
    setMessages(data || []);
  };

  const sendMessage = async () => {
    if (!selectedUser || !newMessage.trim()) return;

    try {
      // Get admin user ID
      const { data: adminData } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin')
        .limit(1)
        .single();

      const adminId = adminData?.user_id;
      if (!adminId) {
        toast({ title: 'Error', description: 'Admin user not found', variant: 'destructive' });
        return;
      }

      // Send message to private_messages table (this shows up in user's Chat page)
      const { error } = await supabase
        .from('private_messages')
        .insert({
          from_user_id: adminId,
          to_user_id: selectedUser.id,
          message: newMessage.trim()
        });

      if (error) throw error;

      // Also send a notification so user knows they have a message
      await supabase
        .from('user_notifications')
        .insert({
          user_id: selectedUser.id,
          title: 'New Message from Admin',
          message: newMessage.trim().slice(0, 100) + (newMessage.length > 100 ? '...' : ''),
          type: 'admin_message',
          status: 'unread'
        });

      setNewMessage('');
      toast({ title: 'Sent', description: 'Message sent to user chat' });
      loadMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      toast({ title: 'Error', description: 'Failed to send message', variant: 'destructive' });
    }
  };

  const getAdminId = async () => {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .single();
    return data?.user_id;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[600px]">
      {/* User List */}
      <div className="col-span-1 border rounded-lg flex flex-col">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search users..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {filteredUsers.map(user => (
            <div 
              key={user.id} 
              onClick={() => setSelectedUser(user)} 
              className={`flex items-center space-x-2 p-3 hover:bg-muted cursor-pointer border-b ${
                selectedUser?.id === user.id ? 'bg-muted' : ''
              }`}
            >
              <Avatar className="w-10 h-10">
                <AvatarImage src={user.avatar_url} />
                <AvatarFallback>{user.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{user.username}</div>
                {user.is_online && (
                  <Badge variant="outline" className="text-xs">Online</Badge>
                )}
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="col-span-1 md:col-span-2 border rounded-lg flex flex-col">
        {selectedUser ? (
          <>
            <div className="p-4 border-b flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={selectedUser.avatar_url} />
                <AvatarFallback>{selectedUser.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold">{selectedUser.username}</div>
                <div className="text-xs text-muted-foreground">
                  Messages sent here appear in user's Chat page
                </div>
              </div>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map(msg => {
                  const isFromAdmin = msg.from_user_id !== selectedUser.id;
                  return (
                    <div key={msg.id} className={`flex ${isFromAdmin ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-lg px-4 py-2 ${
                        isFromAdmin 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}>
                        <p>{msg.message}</p>
                        <p className={`text-xs mt-1 ${isFromAdmin ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="p-4 border-t flex space-x-2">
              <Input 
                value={newMessage} 
                onChange={e => setNewMessage(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
              />
              <Button onClick={sendMessage} disabled={!newMessage.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a user to start chatting
          </div>
        )}
      </div>
    </div>
  );
};