import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, CheckCircle2, Lock, Loader2, AlertTriangle, FileText, ChevronLeft
} from 'lucide-react';

export type VerifyInfo = {
  level: number;
  status: string;
  earningStatus: string;
  fullName?: string | null;
  dateOfBirth?: string | null;
  addressLine?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  country?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  hasAvatar: boolean;
  termsAccepted: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  info: VerifyInfo;
  onUpdated: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  ACTION_REQUIRED: 'Action required',
  VERIFIED: 'Verified',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
  RESTRICTED: 'Restricted',
};

export function VerificationPanel({ open, onClose, info, onUpdated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<'hub' | 'level1' | 'level2' | 'level3'>('hub');
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState(info.fullName || '');
  const [dob, setDob] = useState(info.dateOfBirth || '');
  const [address, setAddress] = useState(info.addressLine || '');
  const [city, setCity] = useState(info.city || '');
  const [stateRegion, setStateRegion] = useState(info.stateRegion || '');
  const [country, setCountry] = useState(info.country || 'NG');
  const [phone, setPhone] = useState(info.phone || '');
  const [acceptTerms, setAcceptTerms] = useState(!!info.termsAccepted);
  const [idNote, setIdNote] = useState('');
  const [bankNote, setBankNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('hub');
    setFullName(info.fullName || '');
    setDob(info.dateOfBirth || '');
    setAddress(info.addressLine || '');
    setCity(info.city || '');
    setStateRegion(info.stateRegion || '');
    setCountry(info.country || 'NG');
    setPhone(info.phone || '');
    setAcceptTerms(!!info.termsAccepted);
  }, [open, info]);

  if (!open) return null;

  const submitLevel1 = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (!info.hasAvatar) {
        toast({
          title: 'Profile picture required',
          description: 'Upload a profile photo in Edit Profile, then return here.',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }
      const { data, error } = await supabase.rpc('submit_verification_level1' as any, {
        p_full_name: fullName.trim(),
        p_date_of_birth: dob,
        p_address_line: address.trim(),
        p_city: city.trim(),
        p_state_region: stateRegion.trim() || null,
        p_country: country.trim() || 'NG',
        p_phone: phone.trim() || null,
        p_accept_terms: acceptTerms,
        p_terms_version: 'rewards-v1',
      });
      if (error) throw error;
      const res = data as any;
      if (res?.success === false) {
        toast({ title: 'Could not complete Level 1', description: res.error || 'Check the form', variant: 'destructive' });
        setSaving(false);
        return;
      }
      toast({ title: 'Level 1 complete', description: 'Basic verification is verified.' });
      onUpdated();
      setStep('hub');
    } catch (e: any) {
      // Fallback: direct profile update if RPC not migrated yet
      try {
        const { error: upErr } = await supabase
          .from('user_profiles')
          .update({
            full_name: fullName.trim(),
            date_of_birth: dob,
            address_line: address.trim(),
            city: city.trim(),
            state_region: stateRegion.trim() || null,
            country: country.trim() || 'NG',
            phone: phone.trim() || null,
            terms_rewards_accepted_at: new Date().toISOString(),
            terms_rewards_version: 'rewards-v1',
            verification_level: Math.max(info.level, 1),
            verification_status: 'VERIFIED',
          } as any)
          .eq('id', user.id);
        if (upErr) throw upErr;
        toast({ title: 'Level 1 saved', description: 'Basic info saved. Run the verification SQL migration for full audit support.' });
        onUpdated();
        setStep('hub');
      } catch (e2: any) {
        toast({ title: 'Error', description: e2?.message || e?.message || 'Failed', variant: 'destructive' });
      }
    } finally {
      setSaving(false);
    }
  };

  const submitHigher = async (level: 2 | 3) => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        note: level === 2 ? idNote : bankNote,
        submitted_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.rpc('submit_verification_level' as any, {
        p_target_level: level,
        p_payload: payload,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.success === false) {
        toast({ title: 'Submit failed', description: res.error, variant: 'destructive' });
        setSaving(false);
        return;
      }
      // Fallback status update
      await supabase
        .from('user_profiles')
        .update({ verification_status: 'UNDER_REVIEW' } as any)
        .eq('id', user.id);
      toast({
        title: `Level ${level} submitted`,
        description: 'Your request is under review. Withdrawals unlock after Level 2 approval.',
      });
      onUpdated();
      setStep('hub');
    } catch (e: any) {
      try {
        await supabase.from('verification_requests').insert({
          user_id: user.id,
          target_level: level,
          status: 'UNDER_REVIEW',
          payload: { note: level === 2 ? idNote : bankNote },
        } as any);
        await supabase
          .from('user_profiles')
          .update({ verification_status: 'UNDER_REVIEW' } as any)
          .eq('id', user.id);
        toast({ title: `Level ${level} submitted`, description: 'Under review.' });
        onUpdated();
        setStep('hub');
      } catch (e2: any) {
        toast({
          title: 'Error',
          description: e2?.message || e?.message || 'Run the verification SQL migration in Supabase.',
          variant: 'destructive',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const level = info.level || 0;
  const status = info.status || 'NOT_STARTED';

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#12132a] border border-white/10 text-white">
        <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#12132a]/95 backdrop-blur">
          {step !== 'hub' ? (
            <button type="button" onClick={() => setStep('hub')} className="p-1 text-white/60 hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <Shield className="w-5 h-5 text-violet-300" />
          )}
          <div className="flex-1">
            <p className="text-sm font-bold">
              {step === 'hub' && 'Verification'}
              {step === 'level1' && 'Level 1 · Basic Info'}
              {step === 'level2' && 'Level 2 · ID Verification'}
              {step === 'level3' && 'Level 3 · Advanced'}
            </p>
            <p className="text-[11px] text-white/45">
              Status: {STATUS_LABEL[status] || status} · Level {level} of 3
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xs text-white/50 px-2 py-1">Close</button>
        </div>

        <div className="p-4 space-y-4">
          {step === 'hub' && (
            <>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[12px] text-white/60">
                Level 1 unlocks full social use and pending rewards tracking.
                <strong className="text-white/80"> Withdrawals require Level 2.</strong>
                Level 3 raises monthly limits.
              </div>

              {[
                {
                  n: 1,
                  title: 'Basic Info',
                  desc: 'Full name, DOB, address, profile photo, accept rewards terms',
                  locked: false,
                  done: level >= 1,
                },
                {
                  n: 2,
                  title: 'ID Verification',
                  desc: 'Identity check + payout account review. Unlocks withdrawals (min ₦5,000).',
                  locked: level < 1,
                  done: level >= 2,
                },
                {
                  n: 3,
                  title: 'Advanced',
                  desc: 'Higher withdrawal limits and advanced payout features.',
                  locked: level < 2,
                  done: level >= 3,
                },
              ].map((s) => (
                <button
                  key={s.n}
                  type="button"
                  disabled={s.locked}
                  onClick={() => {
                    if (s.n === 1) setStep('level1');
                    if (s.n === 2) setStep('level2');
                    if (s.n === 3) setStep('level3');
                  }}
                  className={`w-full text-left rounded-xl border p-4 flex items-start gap-3 transition-colors ${
                    s.done
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : s.locked
                      ? 'border-white/5 bg-white/[0.03] opacity-50'
                      : 'border-white/10 bg-white/5 hover:border-violet-500/40'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    s.done ? 'bg-emerald-500/30 text-emerald-300' : 'bg-violet-500/20 text-violet-300'
                  }`}>
                    {s.done ? <CheckCircle2 className="w-5 h-5" /> : s.locked ? <Lock className="w-4 h-4" /> : s.n}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">Level {s.n} · {s.title}</p>
                    <p className="text-[11px] text-white/45 mt-0.5">{s.desc}</p>
                    {s.done && <p className="text-[11px] text-emerald-300 mt-1">Completed</p>}
                    {!s.done && !s.locked && status === 'UNDER_REVIEW' && s.n > 1 && (
                      <p className="text-[11px] text-amber-300 mt-1">Under review</p>
                    )}
                  </div>
                </button>
              ))}

              {status === 'UNDER_REVIEW' && (
                <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-100">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  Your verification is under review. You will be notified when it is approved or if action is required.
                </div>
              )}
            </>
          )}

          {step === 'level1' && (
            <div className="space-y-3">
              {!info.hasAvatar && (
                <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-100">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Upload a profile picture in Edit Profile before submitting Level 1.
                </div>
              )}
              <div>
                <Label className="text-white/70 text-xs">Full name *</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 bg-white/5 border-white/15 text-white" placeholder="As on your ID" />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Date of birth *</Label>
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="mt-1 bg-white/5 border-white/15 text-white" />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Address *</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 bg-white/5 border-white/15 text-white" placeholder="Street address" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-white/70 text-xs">City *</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 bg-white/5 border-white/15 text-white" />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">State / Region</Label>
                  <Input value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} className="mt-1 bg-white/5 border-white/15 text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-white/70 text-xs">Country</Label>
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 bg-white/5 border-white/15 text-white" placeholder="NG" />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 bg-white/5 border-white/15 text-white" placeholder="+234..." />
                </div>
              </div>
              <label className="flex items-start gap-2 text-[12px] text-white/70 cursor-pointer">
                <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-1" />
                <span>
                  I accept the <span className="text-violet-300">Terms & Rewards rules</span> (version rewards-v1). Withdrawals remain locked until Level 2.
                </span>
              </label>
              <Button
                className="w-full bg-violet-600 hover:bg-violet-500"
                disabled={saving || !acceptTerms}
                onClick={submitLevel1}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {level >= 1 ? 'Update Level 1 info' : 'Complete Level 1'}
              </Button>
            </div>
          )}

          {step === 'level2' && (
            <div className="space-y-3">
              {level < 1 ? (
                <p className="text-sm text-white/50">Complete Level 1 first.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[12px] text-white/55 flex gap-2">
                    <FileText className="w-4 h-4 shrink-0 text-violet-300" />
                    Submit for identity & payout-account review. Admin/bots will review. Minimum withdrawal after approval: ₦5,000. Level 2 monthly limit starts at ₦7,000 (configurable).
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs">Notes for reviewers (optional)</Label>
                    <Input value={idNote} onChange={(e) => setIdNote(e.target.value)} className="mt-1 bg-white/5 border-white/15 text-white" placeholder="e.g. NIN ready, bank account on file" />
                  </div>
                  <Button className="w-full bg-violet-600 hover:bg-violet-500" disabled={saving || level >= 2} onClick={() => submitHigher(2)}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {level >= 2 ? 'Level 2 already complete' : status === 'UNDER_REVIEW' ? 'Already under review' : 'Submit Level 2 for review'}
                  </Button>
                </>
              )}
            </div>
          )}

          {step === 'level3' && (
            <div className="space-y-3">
              {level < 2 ? (
                <p className="text-sm text-white/50">Complete Level 2 first.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[12px] text-white/55">
                    Advanced verification unlocks higher monthly limits (default up to ₦250,000 — admin configurable) and advanced payout features.
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs">Notes (optional)</Label>
                    <Input value={bankNote} onChange={(e) => setBankNote(e.target.value)} className="mt-1 bg-white/5 border-white/15 text-white" />
                  </div>
                  <Button className="w-full bg-violet-600 hover:bg-violet-500" disabled={saving || level >= 3} onClick={() => submitHigher(3)}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {level >= 3 ? 'Level 3 already complete' : 'Submit Level 3 for review'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VerificationPanel;
