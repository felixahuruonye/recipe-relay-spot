import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle, RefreshCw, Shield, Ban, Scale, Loader2
} from 'lucide-react';

export function FraudRiskTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [appeals, setAppeals] = useState<any[]>([]);
  const [restrictions, setRestrictions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  const [restrictUserId, setRestrictUserId] = useState('');
  const [restrictType, setRestrictType] = useState('withdrawal');
  const [restrictReason, setRestrictReason] = useState('');
  const [caseUserId, setCaseUserId] = useState('');
  const [caseTitle, setCaseTitle] = useState('');
  const [caseSummary, setCaseSummary] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ev, cs, ap, rs] = await Promise.all([
        (supabase as any).from('risk_events').select('*').order('created_at', { ascending: false }).limit(80),
        (supabase as any).from('fraud_cases').select('*').order('created_at', { ascending: false }).limit(40),
        (supabase as any).from('appeals').select('*').order('created_at', { ascending: false }).limit(40),
        (supabase as any).from('account_restrictions').select('*').eq('active', true).order('created_at', { ascending: false }).limit(40),
      ]);
      setEvents(ev.data || []);
      setCases(cs.data || []);
      setAppeals(ap.data || []);
      setRestrictions(rs.data || []);

      const ids = new Set<string>();
      [...(ev.data || []), ...(cs.data || []), ...(ap.data || []), ...(rs.data || [])].forEach((r: any) => {
        if (r.user_id) ids.add(r.user_id);
      });
      if (ids.size) {
        const { data: profs } = await supabase
          .from('user_profiles')
          .select('id, username, risk_score, withdrawal_restricted, tipping_restricted, rewards_hold, earning_status')
          .in('id', [...ids]);
        const map: Record<string, any> = {};
        (profs || []).forEach((p: any) => { map[p.id] = p; });
        setProfiles(map);
      }
    } catch (e: any) {
      toast({
        title: 'Load failed',
        description: e?.message || 'Run Stage 5 SQL migration in Supabase.',
        variant: 'destructive',
      });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const nameOf = (uid: string) => profiles[uid]?.username || uid?.slice(0, 8) || '—';

  const openCase = async () => {
    if (!caseUserId.trim() || !caseTitle.trim()) {
      toast({ title: 'User ID and title required', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const score = profiles[caseUserId]?.risk_score ?? 0;
      const { error } = await (supabase as any).from('fraud_cases').insert({
        user_id: caseUserId.trim(),
        title: caseTitle.trim(),
        summary: caseSummary.trim() || null,
        status: 'open',
        risk_score_snapshot: score,
      });
      if (error) throw error;
      toast({ title: 'Case opened' });
      setCaseTitle('');
      setCaseSummary('');
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  const resolveCase = async (id: string, status: string) => {
    setBusy(true);
    try {
      const { error } = await (supabase as any)
        .from('fraud_cases')
        .update({ status, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast({ title: `Case marked ${status}` });
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  const applyRestriction = async () => {
    if (!restrictUserId.trim()) {
      toast({ title: 'User ID required', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('apply_account_restriction' as any, {
        p_user_id: restrictUserId.trim(),
        p_restriction_type: restrictType,
        p_reason: restrictReason || null,
        p_case_id: null,
        p_expires_at: null,
      });
      if (error || (data as any)?.success === false) {
        throw new Error(error?.message || (data as any)?.error || 'Failed');
      }
      toast({ title: 'Restriction applied', description: 'Wallet balances were not erased.' });
      setRestrictReason('');
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  const liftRestriction = async (id: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('lift_account_restriction' as any, {
        p_restriction_id: id,
        p_note: 'Lifted by admin',
      });
      if (error || (data as any)?.success === false) {
        throw new Error(error?.message || (data as any)?.error || 'Failed');
      }
      toast({ title: 'Restriction lifted' });
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  const reviewAppeal = async (id: string, status: 'accepted' | 'rejected') => {
    setBusy(true);
    try {
      const { error } = await (supabase as any)
        .from('appeals')
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          admin_response: status === 'accepted' ? 'Appeal accepted' : 'Appeal rejected',
        })
        .eq('id', id);
      if (error) throw error;
      toast({ title: `Appeal ${status}` });
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> Fraud & risk
          </h2>
          <p className="text-xs text-muted-foreground">
            Signals, cases, restrictions, and appeals. Restrictions do not wipe wallets.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Open fraud case</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="User ID (uuid)" value={caseUserId} onChange={(e) => setCaseUserId(e.target.value)} />
            <Input placeholder="Title" value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} />
            <Textarea placeholder="Summary / evidence notes" value={caseSummary} onChange={(e) => setCaseSummary(e.target.value)} />
            <Button size="sm" onClick={openCase} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create case'}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Apply restriction</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="User ID (uuid)" value={restrictUserId} onChange={(e) => setRestrictUserId(e.target.value)} />
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={restrictType}
              onChange={(e) => setRestrictType(e.target.value)}
            >
              <option value="withdrawal">Withdrawal hold</option>
              <option value="tipping">Tipping hold</option>
              <option value="rewards_hold">Rewards hold</option>
              <option value="monetization_suspend">Monetization suspend</option>
              <option value="account_suspend">Account suspend (earning)</option>
            </select>
            <Input placeholder="Reason (required for audit)" value={restrictReason} onChange={(e) => setRestrictReason(e.target.value)} />
            <Button size="sm" variant="destructive" onClick={applyRestriction} disabled={busy}>
              <Ban className="w-4 h-4 mr-1" /> Apply
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Recent risk events</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No risk events yet. Run Stage 5 SQL to enable logging.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2 border-b border-border/50 py-2 text-sm">
                  <div>
                    <p className="font-medium">{e.event_type} · @{nameOf(e.user_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      severity {e.severity} · Δscore {e.score_delta} · {e.source} · {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                    </p>
                  </div>
                  <Badge variant="outline">risk {profiles[e.user_id]?.risk_score ?? '—'}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Fraud cases</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto">
            {cases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cases</p>
            ) : cases.map((c) => (
              <div key={c.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex justify-between gap-2">
                  <p className="font-semibold text-sm">{c.title}</p>
                  <Badge>{c.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">@{nameOf(c.user_id)} · score snap {c.risk_score_snapshot}</p>
                {c.summary && <p className="text-xs">{c.summary}</p>}
                {c.status === 'open' || c.status === 'under_review' ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button size="sm" variant="outline" onClick={() => resolveCase(c.id, 'resolved_legit')}>Legit</Button>
                    <Button size="sm" variant="destructive" onClick={() => resolveCase(c.id, 'confirmed_fraud')}>Fraud</Button>
                    <Button size="sm" variant="secondary" onClick={() => resolveCase(c.id, 'under_review')}>Reviewing</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Scale className="w-4 h-4" /> Appeals</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto">
            {appeals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appeals</p>
            ) : appeals.map((a) => (
              <div key={a.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex justify-between">
                  <p className="text-sm font-medium">@{nameOf(a.user_id)}</p>
                  <Badge variant="outline">{a.status}</Badge>
                </div>
                <p className="text-xs">{a.message}</p>
                {a.status === 'open' && (
                  <div className="flex gap-1 pt-1">
                    <Button size="sm" onClick={() => reviewAppeal(a.id, 'accepted')}>Accept</Button>
                    <Button size="sm" variant="destructive" onClick={() => reviewAppeal(a.id, 'rejected')}>Reject</Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Active restrictions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {restrictions.length === 0 ? (
            <p className="text-sm text-muted-foreground">None active</p>
          ) : restrictions.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b py-2 text-sm">
              <div>
                <p className="font-medium">@{nameOf(r.user_id)} · {r.restriction_type}</p>
                <p className="text-xs text-muted-foreground">{r.reason || 'No reason'} · {r.created_at ? new Date(r.created_at).toLocaleString() : ''}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => liftRestriction(r.id)} disabled={busy}>Lift</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default FraudRiskTab;
