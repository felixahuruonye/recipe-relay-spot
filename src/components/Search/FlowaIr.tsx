import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Sparkles, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

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

// Clean markdown symbols from AI response
const cleanAIText = (text: string): string => {
  return text
    .replace(/\*\*/g, '')     // Remove bold markers
    .replace(/\*/g, '')       // Remove italic markers
    .replace(/#{1,6}\s/g, '') // Remove heading markers
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, '').trim()) // Clean code blocks
    .replace(/`([^`]+)`/g, '$1') // Remove inline code markers
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1') // Convert links to just text
    .replace(/^[-•]\s/gm, '• ')  // Normalize bullet points
    .replace(/^\d+\.\s/gm, (match) => match) // Keep numbered lists
    .trim();
};

const FlowaIr: React.FC<FlowaIrProps> = ({ 
  summary, recommendations = [], trending = [], newTopic, response, aiResponse, creditsRemaining, error 
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [credits, setCredits] = useState(creditsRemaining ?? 250);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creditsRemaining !== undefined) setCredits(creditsRemaining);
  }, [creditsRemaining]);

  useEffect(() => {
    const initialContent = aiResponse || summary || response;
    if (initialContent && messages.length === 0) {
      setMessages([{ role: 'assistant', content: cleanAIText(initialContent) }]);
    }
  }, [aiResponse, summary, response]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !user || loading) return;
    
    // Check if input is a URL - open it in an iframe dialog
    const urlPattern = /^https?:\/\//i;
    if (urlPattern.test(input.trim())) {
      const url = input.trim();
      setInput('');
      setMessages(prev => [...prev, { role: 'user', content: url }, { role: 'assistant', content: `Opening link: ${url}` }]);
      // Open in new tab as in-app browser (iframe blocked by most sites)
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

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
        toast({ title: 'Lenory AI', description: data.error, variant: 'destructive' });
        setLoading(false);
        return;
      }

      const rawResponse = data?.aiResponse || 'I couldn\'t process that. Try again!';
      const assistantMsg: ChatMessage = { role: 'assistant', content: cleanAIText(rawResponse) };
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
        <CardHeader><CardTitle>Lenory AI</CardTitle></CardHeader>
        <CardContent><p className="text-destructive">{error}</p></CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="w-5 h-5 text-primary" />
          Lenory AI
          <span className="text-xs font-normal text-muted-foreground ml-auto flex items-center gap-2">
            {credits} credits
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearChat}>
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">Ask Lenory AI anything! Paste a link to open it directly.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Chat Messages - scrollable */}
        {messages.length > 0 && (
          <div 
            ref={scrollContainerRef}
            className="max-h-[400px] overflow-y-auto pr-2 space-y-3"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <Avatar className="w-7 h-7 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">AI</AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
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
          </div>
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
            placeholder="Ask Lenory AI anything or paste a link..."
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

        {/* Trending */}
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