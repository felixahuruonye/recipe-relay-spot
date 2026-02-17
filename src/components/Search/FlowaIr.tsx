import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Sparkles, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface FlowaIrProps {
  summary?: string;
  recommendations?: any[];
  trending?: any[];
  newTopic?: { title: string; category: string; };
  response?: string;
  aiResponse?: string;
  creditsRemaining?: number;
  error?: string;
}

const FlowaIr: React.FC<FlowaIrProps> = ({ 
  summary, recommendations = [], trending = [], newTopic, response, aiResponse, creditsRemaining, error 
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [credits, setCredits] = useState(creditsRemaining ?? 250);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creditsRemaining !== undefined) setCredits(creditsRemaining);
  }, [creditsRemaining]);

  // Show initial AI response as first message if provided
  useEffect(() => {
    const initialContent = aiResponse || summary || response;
    if (initialContent && messages.length === 0) {
      setMessages([{ role: 'assistant', content: initialContent }]);
    }
  }, [aiResponse, summary, response]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !user || loading) return;
    
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('flowair-search', {
        body: { 
          query: userMsg.content, 
          trending,
          conversationHistory: updatedMessages.slice(-10),
          mode: 'chat',
        },
      });

      if (fnError) throw fnError;

      if (data?.error) {
        toast({ title: 'FlowaIr', description: data.error, variant: 'destructive' });
        setLoading(false);
        return;
      }

      const assistantMsg: ChatMessage = { role: 'assistant', content: data?.aiResponse || 'I couldn\'t process that. Try again!' };
      setMessages(prev => [...prev, assistantMsg]);
      if (data?.creditsRemaining !== undefined) setCredits(data.creditsRemaining);
    } catch (err: any) {
      console.error('FlowaIr error:', err);
      toast({ title: 'Error', description: err.message || 'FlowaIr is resting. Try again!', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle>FlowaIr</CardTitle></CardHeader>
        <CardContent><p className="text-destructive">{error}</p></CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="w-5 h-5 text-primary" />
          FlowaIr AI
          <span className="text-xs font-normal text-muted-foreground ml-auto flex items-center gap-2">
            {credits} credits
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearChat}>
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">Ask me anything! I can write content, answer questions, search the web, and help you navigate SaveMore.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Chat Messages */}
        {messages.length > 0 && (
          <ScrollArea className="max-h-[300px] pr-2">
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <Avatar className="w-7 h-7 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">AI</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2">
                  <Avatar className="w-7 h-7 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">AI</AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-2xl px-3 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
        )}

        {/* Quick Actions */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {['Write a post caption', 'What\'s trending?', 'How to earn Stars?', 'Help me sell a product'].map(q => (
              <Button key={q} variant="outline" size="sm" className="text-xs" onClick={() => { setInput(q); }}>
                {q}
              </Button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            placeholder="Ask FlowaIr anything..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            disabled={loading}
            className="flex-1"
          />
          <Button size="icon" onClick={sendMessage} disabled={!input.trim() || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {/* Trending & Recommendations */}
        {Array.isArray(trending) && trending.length > 0 && messages.length === 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-1">Trending</h4>
            <div className="flex flex-wrap gap-1">
              {trending.slice(0, 5).map((item: any, index: number) => (
                <Button 
                  key={index} 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs h-6 px-2"
                  onClick={() => setInput(typeof item === 'string' ? item : item?.keyword || '')}
                >
                  {typeof item === 'string' ? item : item?.keyword || item?.term}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FlowaIr;
