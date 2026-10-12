import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const STAR_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 100];

export default function AutoDeductionConfig() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selected, setSelected] = useState(1);
  const [rate, setRate] = useState(300);
  const [viewerPct, setViewerPct] = useState(35);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('auto_deduct_stars')
        .eq('id', user.id)
        .maybeSingle();
      if (profile && (profile as any).auto_deduct_stars) {
        setSelected(Number((profile as any).auto_deduct_stars) || 1);
      }
      const { data: settings } = await supabase
        .from('admin_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['star_to_ngn_rate', 'split_viewer_cashback_pct']);
      (settings || []).forEach((s: any) => {
        if (s.setting_key === 'star_to_ngn_rate') setRate(Number(s.setting_value) || 300);
        if (s.setting_key === 'split_viewer_cashback_pct') setViewerPct(Number(s.setting_value) || 35);
      });
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('user_profiles')
      .update({ auto_deduct_stars: selected } as any)
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      // column may not exist yet — store in story_settings as fallback
      const { data: current } = await supabase.from('user_profiles').select('story_settings').eq('id', user.id).single();
      const existing = (current?.story_settings as any) || {};
      await supabase.from('user_profiles').update({
        story_settings: { ...existing, auto_deduct_stars: selected },
      }).eq('id', user.id);
    }
    toast({ title: 'Saved', description: `Auto deduction set to ${selected} Stars per qualified view` });
  };

  const earnEstimate = Math.round(selected * rate * (viewerPct / 100));

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Configure Auto Deduction</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stars per post view</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              When Auto-Spend is ON, this amount is deducted from your Star balance after you watch:
            </p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li><strong>Short posts</strong> — after about 30 seconds</li>
              <li><strong>Long posts</strong> — after about 60 seconds</li>
            </ul>
            <div className="grid grid-cols-4 gap-2 pt-2">
              {STAR_OPTIONS.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSelected(n)}
                  className={`rounded-xl border py-3 text-sm font-bold flex flex-col items-center gap-0.5 transition-colors ${
                    selected === n
                      ? 'border-yellow-500 bg-yellow-500/15 text-yellow-600'
                      : 'border-border bg-muted/40'
                  }`}
                >
                  <span className="flex items-center gap-0.5">
                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                    {n}
                  </span>
                </button>
              ))}
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p>
                Selected: <strong>{selected} Star{selected > 1 ? 's' : ''}</strong>
              </p>
              <p className="text-muted-foreground">
                Estimated viewer cashback per view: <strong>₦{earnEstimate}</strong>
                <span className="text-xs"> (at ₦{rate}/star · {viewerPct}% viewer share)</span>
              </p>
            </div>
            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save amount'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
