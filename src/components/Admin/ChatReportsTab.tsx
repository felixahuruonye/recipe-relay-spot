import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

type Report = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  details: string | null;
  transcript: any[];
  status: string;
  created_at: string;
};

export const ChatReportsTab: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Report[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Report | null>(null);

  const load = async () => {
    const { data } = await supabase.from('chat_reports' as any).select('*').order('created_at', { ascending: false }).limit(200);
    const list = (data as any as Report[]) || [];
    setRows(list);
    const ids = Array.from(new Set(list.flatMap(r => [r.reporter_id, r.reported_id])));
    if (ids.length) {
      const { data: profs } = await supabase.from('user_profiles').select('id,username').in('id', ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => (map[p.id] = p.username));
      setNames(map);
    }
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('chat_reports' as any).update({ status }).eq('id', id);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    toast({ title: `Marked ${status}` });
    load();
  };

  const name = (id: string) => names[id] ? `@${names[id]}` : id.slice(0, 8);

  return (
    <Card>
      <CardHeader><CardTitle>Chat Reports ({rows.length})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <div className="text-sm text-muted-foreground">No chat reports yet.</div>}
        {rows.map(r => (
          <div key={r.id} className="border rounded-lg p-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{name(r.reporter_id)} reported {name(r.reported_id)}</div>
              <div className="text-xs text-muted-foreground">{r.reason}{r.details ? ` — ${r.details}` : ''}</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {new Date(r.created_at).toLocaleString()} · {(r.transcript || []).length} messages attached
              </div>
            </div>
            <Badge variant={r.status === 'pending' ? 'destructive' : 'outline'}>{r.status}</Badge>
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="outline" onClick={() => setOpen(r)}>View chat</Button>
              {r.status === 'pending' && (
                <Button size="sm" onClick={() => setStatus(r.id, 'reviewed')}>Mark reviewed</Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Conversation: {open ? `${name(open.reporter_id)} ↔ ${name(open.reported_id)}` : ''}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-3">
            <div className="space-y-2">
              {(open?.transcript || []).map((m: any) => (
                <div key={m.id} className={`text-sm p-2 rounded-lg ${m.from_user_id === open?.reported_id ? 'bg-destructive/10' : 'bg-muted'}`}>
                  <div className="text-[11px] text-muted-foreground">{name(m.from_user_id)} · {new Date(m.created_at).toLocaleString()}</div>
                  <div className="break-words">{m.message}</div>
                  {m.media_url && <a href={m.media_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">View media</a>}
                </div>
              ))}
              {open && (open.transcript || []).length === 0 && <div className="text-sm text-muted-foreground">No messages captured.</div>}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ChatReportsTab;
