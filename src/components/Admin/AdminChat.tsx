import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, ThumbsUp } from 'lucide-react';

export const AdminChat: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      loadMessages();
      const channel = supabase
        .channel(`admin-chat-${selectedUser.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_private_messages', filter: `user_id=eq.${selectedUser.id}` }, loadMessages)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedUser]);

  const loadUsers = async () => {
    const { data } = await supabase.from('user_profiles').select('*').order('username');
    setUsers(data || []);
  };

  const loadMessages = async () => {
    if (!selectedUser) return;
    const { data } = await supabase
      .from('admin_private_messages')
      .select('*')
      .eq('user_id', selectedUser.id)
      .order('created_at');
    setMessages(data || []);
  };

  const sendMessage = async () => {
    if (!selectedUser || !newMessage.trim()) return;
    await supabase.from('admin_private_messages').insert({
      user_id: selectedUser.id,
      message_content: newMessage.trim(),
      is_from_admin: true
    });
    setNewMessage('');
  };

  return (
    <div className="grid grid-cols-3 gap-4 h-[600px]">
      <ScrollArea className="col-span-1 border rounded-lg p-2">
        {users.map(user => (
          <div key={user.id} onClick={() => setSelectedUser(user)} className="flex items-center space-x-2 p-2 hover:bg-muted cursor-pointer rounded">
            <Avatar className="w-10 h-10">
              <AvatarImage src={user.avatar_url} />
              <AvatarFallback>{user.username?.[0]}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{user.username}</span>
          </div>
        ))}
      </ScrollArea>
      <div className="col-span-2 border rounded-lg flex flex-col">
        {selectedUser ? (
          <>
            <div className="p-4 border-b font-semibold">{selectedUser.username}</div>
            <ScrollArea className="flex-1 p-4">
              {messages.map(msg => (
                <div key={msg.id} className={`mb-4 ${msg.is_from_admin ? 'text-right' : ''}`}>
                  <div className={`inline-block rounded-lg px-4 py-2 ${msg.is_from_admin ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    {msg.message_content}
                  </div>
                </div>
              ))}
            </ScrollArea>
            <div className="p-4 border-t flex space-x-2">
              <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} />
              <Button onClick={sendMessage}><Send className="h-4 w-4" /></Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">Select a user to chat</div>
        )}
      </div>
    </div>
  );
};
