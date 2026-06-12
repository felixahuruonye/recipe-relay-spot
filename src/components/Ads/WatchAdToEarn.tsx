import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

/**
 * Watch Ad to Earn — placeholder shell.
 *
 * Today: shows a 5s "playing ad" simulation, then calls
 * `record-ad-impression` which credits 1 Silver Star (₦1.50 pool).
 *
 * When AdSterra script is pasted (in index.html or a hook here),
 * swap `runAdsterraInterstitial()` to call the real network and
 * await its completion event before invoking the edge function.
 */
export const WatchAdToEarn: React.FC<{ className?: string }> = ({ className }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const runAdsterraInterstitial = (): Promise<boolean> => {
    // TODO: replace with real AdSterra SDK call
    return new Promise((resolve) => setTimeout(() => resolve(true), 5000));
  };

  const handleClick = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Create a free account to start earning Silver Stars.',
      });
      return;
    }
    setLoading(true);
    try {
      const completed = await runAdsterraInterstitial();
      if (!completed) {
        toast({ title: 'Ad skipped', description: 'Watch the full ad to earn.' });
        return;
      }
      const { data, error } = await supabase.functions.invoke(
        'record-ad-impression',
        { body: { placement: 'fullscreen_silver', network: 'adsterra' } }
      );
      if (error) throw error;
      if ((data as any)?.credited > 0) {
        toast({
          title: '+1 Silver Star',
          description: 'Tip a creator to convert it to NGN cashback.',
        });
      } else {
        toast({
          title: 'Try again shortly',
          description: 'Daily ad rate limit reached.',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Could not record ad',
        description: e?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      className={
        'gap-2 bg-gradient-to-r from-amber-400 to-orange-500 text-black hover:from-amber-300 hover:to-orange-400 ' +
        (className ?? '')
      }
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4" />
      )}
      {loading ? 'Playing ad…' : 'Watch Ad to Earn'}
    </Button>
  );
};

export default WatchAdToEarn;
