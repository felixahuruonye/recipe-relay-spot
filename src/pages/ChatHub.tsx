import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Chat from '@/pages/Chat';
import Groups from '@/pages/Groups';
import { MessageCircle, Users } from 'lucide-react';

const ChatHub: React.FC = () => {
  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <Tabs defaultValue="chat" className="w-full">
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-3 pt-3 pb-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="chat" className="gap-2"><MessageCircle className="w-4 h-4" />Chat</TabsTrigger>
            <TabsTrigger value="groups" className="gap-2"><Users className="w-4 h-4" />Groups</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="chat" className="p-0"><Chat /></TabsContent>
        <TabsContent value="groups" className="p-0"><Groups /></TabsContent>
      </Tabs>
    </div>
  );
};

export default ChatHub;
