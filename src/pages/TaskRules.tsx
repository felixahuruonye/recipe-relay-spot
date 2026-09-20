import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

const TaskRules: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showSlowDown, setShowSlowDown] = useState(false);
  const [saving, setSaving] = useState(false);
  const lastScrollTime = useRef(Date.now());
  const lastScrollTop = useRef(0);

  useEffect(() => {
    // If already accepted before, skip straight to the tasks page.
    if (!user) return;
    supabase.from('task_rules_acceptance').select('user_id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) navigate('/tasks', { replace: true }); });
  }, [user, navigate]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;

    const now = Date.now();
    const dt = now - lastScrollTime.current;
    const dScroll = Math.abs(el.scrollTop - lastScrollTop.current);
    lastScrollTime.current = now;
    lastScrollTop.current = el.scrollTop;

    // Scrolling too fast to have actually read anything - interrupt
    // with a popup instead of letting them reach the bottom for free.
    if (dt > 0 && dScroll / dt > 2.2) {
      setShowSlowDown(true);
    }

    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (nearBottom) setReachedEnd(true);
  };

  const handleContinue = async () => {
    if (!user || !agreed || !reachedEnd) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('task_rules_acceptance').insert({ user_id: user.id });
      if (error) throw error;
      navigate('/tasks', { replace: true });
    } catch (e) {
      console.error('Error saving rules acceptance:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <div className="p-4 border-b flex items-center gap-2">
        <ShieldAlert className="w-6 h-6 text-destructive" />
        <div>
          <h1 className="text-lg font-bold">Tasks - Rules & Requirements</h1>
          <p className="text-xs text-muted-foreground">Read everything below before you continue</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 text-sm leading-relaxed"
      >
        <p className="font-bold text-base">Welcome to Tasks - a new way to earn on Lenory.</p>
        <p>
          This feature lets you complete simple offers from our partner networks - app installs, sign-ups,
          surveys - and earn real Stars for each one you finish honestly. Before you can access a single task,
          you need to fully understand how this works and what is expected of you. Please read this entire
          page carefully.
        </p>

        <h2 className="font-bold text-primary">1. What counts as a valid task completion</h2>
        <p>
          A task only pays out once our partner network confirms it was completed for real. This can take
          anywhere from a few minutes to several days depending on the offer. You will see your Stars appear
          automatically the moment it's confirmed - you never need to ask us to check manually.
        </p>

        <h2 className="font-bold text-primary">2. Rules you MUST follow</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>No VPN or proxy.</strong> Your location must genuinely show as your real country. Using a VPN to appear in a different country to unlock better offers is fraud and will be detected.</li>
          <li><strong>Use real information only.</strong> Your real name, real email, and real phone number where an offer asks for them. Fake or temporary/disposable emails are detected and will get you banned.</li>
          <li><strong>One completion per offer, per person.</strong> Do not complete the same offer more than once, and do not create multiple accounts to repeat offers.</li>
          <li><strong>Finish the entire offer.</strong> Partial completions - starting a sign-up and abandoning it, skipping email verification - do not count and will not be paid.</li>
          <li><strong>No bots, scripts, or auto-fill tools.</strong> Every action must be done manually, by you, as a real person.</li>
          <li><strong>Take your time.</strong> Genuine offers take real time to complete properly - reading instructions, filling in real details, verifying an email. Completing offers unrealistically fast is one of the clearest signs of fraud and is actively monitored.</li>
        </ul>

        <h2 className="font-bold text-destructive">3. What happens if you break these rules</h2>
        <p>
          Violating any rule above - even once - can result in your account being <strong>permanently banned</strong>{' '}
          from Lenory, and <strong>all of your earnings across the entire platform being withheld</strong>, not
          just from Tasks. This includes Stars from posts, storylines, tips, and anything else in your wallet.
          We do not make exceptions once fraud is confirmed. This is not a warning we give lightly - it is
          exactly what will happen.
        </p>

        <h2 className="font-bold text-primary">4. Why we're strict about this</h2>
        <p>
          Every task is paid for by a real advertiser through our partner network. If they detect fraudulent
          completions coming from Lenory, they can claw back that payment or remove us from their platform
          entirely - which would end Tasks for every honest user on Lenory, not just the person who broke the
          rules. Following these rules protects your own earnings and everyone else's.
        </p>

        <h2 className="font-bold text-primary">5. Reversals</h2>
        <p>
          If a network later reverses an offer (because it was found to be invalid, fraudulent, or
          incomplete), the Stars you were credited for it will be deducted from your balance, even if you had
          already spent or withdrawn them elsewhere. This is standard across every task/offer platform, not
          unique to Lenory.
        </p>

        <h2 className="font-bold text-primary">6. Verification</h2>
        <p>
          We keep records of task activity - including timing and device information - to confirm that
          completions are genuine. This exists to protect honest users like you from having your account
          wrongly affected by other people's fraud, and to protect the whole Tasks feature from being shut
          down.
        </p>

        <p className="pt-4 font-semibold">
          By checking the box below and continuing, you confirm you have read and understood everything on
          this page, and you agree to follow these rules every time you use Tasks.
        </p>

        <div className="h-4" />
      </div>

      <div className="p-4 border-t space-y-3 bg-card">
        <label className={`flex items-start gap-3 ${!reachedEnd ? 'opacity-40 pointer-events-none' : ''}`}>
          <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} disabled={!reachedEnd} />
          <span className="text-xs text-muted-foreground">
            I have read and understood all the rules above, and I agree to follow them. I understand that
            breaking any rule can lead to a permanent ban and forfeiture of all my earnings on Lenory.
          </span>
        </label>

        {reachedEnd ? (
          <Button className="w-full" disabled={!agreed || saving} onClick={handleContinue}>
            {saving ? 'Saving...' : 'I Understand - Continue to Tasks'}
          </Button>
        ) : (
          <Button className="w-full" disabled>
            Scroll down to read everything first
          </Button>
        )}
      </div>

      <Dialog open={showSlowDown} onOpenChange={setShowSlowDown}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" /> Please slow down
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You're scrolling too fast to actually read this. It's important that you understand exactly how
            Tasks works and how you get paid - please go back and read it properly before continuing.
          </p>
          <Button onClick={() => setShowSlowDown(false)}>Okay, I'll read it properly</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskRules;
