import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Bot, Key, Save, RefreshCw } from 'lucide-react';

interface BotRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  api_key: string | null;
  model: string | null;
  system_prompt: string | null;
  assignment: string | null;
}

const DEFAULT_BOTS: BotRow[] = [
  { id: 'lenory_chat', name: 'Lenory Chat Bot', description: 'Answers user questions in chat and support', enabled: false, api_key: null, model: 'gpt-4o-mini', system_prompt: null, assignment: 'chat_support' },
  { id: 'lenory_moderation', name: 'Moderation Bot', description: 'Flags spam and harmful content', enabled: false, api_key: null, model: 'gpt-4o-mini', system_prompt: null, assignment: 'moderation' },
  { id: 'lenory_feed', name: 'Feed Assistant', description: 'Helps rank and suggest For You content', enabled: false, api_key: null, model: 'gpt-4o-mini', system_prompt: null, assignment: 'feed_ranking' },
  { id: 'lenory_creator', name: 'Creator Coach', description: 'Gives creators tips on their posts', enabled: false, api_key: null, model: 'gpt-4o-mini', system_prompt: null, assignment: 'creator_tips' },
];

export function BotsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bots, setBots] = useState<BotRow[]>(DEFAULT_BOTS);
  const [globalKey, setGlobalKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).from('bot_settings').select('*');
      if (!error && data && data.length > 0) {
        const map = new Map(data.map((b: any) => [b.id, b]));
        setBots(DEFAULT_BOTS.map(d => ({ ...d, ...(map.get(d.id) || {}) })));
        const withKey = data.find((b: any) => b.api_key);
        if (withKey?.api_key) setGlobalKey(withKey.api_key);
      }
    } catch {
      // Table may not exist yet
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveAll = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const rows = bots.map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        enabled: b.enabled,
        api_key: globalKey || b.api_key || null,
        model: b.model || 'gpt-4o-mini',
        system_prompt: b.system_prompt,
        assignment: b.assignment,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }));
      const { error } = await (supabase as any).from('bot_settings').upsert(rows);
      if (error) throw error;
      toast({ title: 'Bots saved', description: 'API key and bot settings are live.' });
    } catch (e: any) {
      toast({
        title: 'Save failed',
        description: e?.message?.includes('relation') || e?.message?.includes('does not exist')
          ? 'Run the bot_settings SQL migration in Supabase first.'
          : (e?.message || 'Unknown error'),
        variant: 'destructive',
      });
    }
    setSaving(false);
  };

  const updateBot = (id: string, patch: Partial<BotRow>) => {
    setBots(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground p-4">Loading bots…</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="w-4 h-4" /> Global API key
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            One key powers all Lenory bots (OpenAI-compatible). Paste your key and enable the bots you want live.
          </p>
          <Input
            type="password"
            placeholder="sk-..."
            value={globalKey}
            onChange={e => setGlobalKey(e.target.value)}
            autoComplete="off"
          />
          <div className="flex gap-2">
            <Button onClick={saveAll} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save all bots'}
            </Button>
            <Button variant="outline" onClick={load} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {bots.map(bot => (
          <Card key={bot.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="w-4 h-4" /> {bot.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={bot.enabled ? 'default' : 'secondary'}>
                    {bot.enabled ? 'Live' : 'Off'}
                  </Badge>
                  <Switch
                    checked={bot.enabled}
                    onCheckedChange={v => updateBot(bot.id, { enabled: v })}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{bot.description}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Model</Label>
                <Input
                  value={bot.model || ''}
                  onChange={e => updateBot(bot.id, { model: e.target.value })}
                  placeholder="gpt-4o-mini"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">System prompt (optional)</Label>
                <Textarea
                  value={bot.system_prompt || ''}
                  onChange={e => updateBot(bot.id, { system_prompt: e.target.value })}
                  placeholder="Instructions for this bot…"
                  rows={3}
                />
              </div>
              <p className="text-xs text-muted-foreground">Assignment: {bot.assignment}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
