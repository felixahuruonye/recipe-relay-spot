import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Wallet, AlertTriangle, FileText, Loader2, Shield } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type PaymentMethod = 'bank_transfer' | 'paystack' | 'flutterwave';

type WithdrawalFormProps = {
  isVip?: boolean;
  onUpgrade?: () => void;
  userId?: string;
  /** When true, show as embedded panel instead of only a trigger button */
  embedded?: boolean;
};

const formatNgn = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n || 0);

export const WithdrawalForm: React.FC<WithdrawalFormProps> = ({ embedded = false }) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(embedded);
  const [tab, setTab] = useState<'request' | 'records'>('request');
  const [loading, setLoading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [walletBalance, setWalletBalance] = useState(0);
  const [verifyLevel, setVerifyLevel] = useState(0);
  const [verifyStatus, setVerifyStatus] = useState('NOT_STARTED');
  const [minWithdrawal, setMinWithdrawal] = useState(5000);
  const [monthlyLimit, setMonthlyLimit] = useState(7000);
  const [monthlyUsed, setMonthlyUsed] = useState(0);
  const [perTxLimit, setPerTxLimit] = useState(0);
  const [feePercent, setFeePercent] = useState(0);
  const [feeFlat, setFeeFlat] = useState(0);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [paymentHandle, setPaymentHandle] = useState('');

  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [appealMsg, setAppealMsg] = useState('');
  const [appealSending, setAppealSending] = useState(false);

  const amountNum = Number(withdrawAmount) || 0;
  const feePreview = useMemo(() => {
    const f = Math.round((amountNum * feePercent) / 100 + feeFlat);
    return Math.max(0, f);
  }, [amountNum, feePercent, feeFlat]);
  const netPreview = Math.max(0, amountNum - feePreview);

  const loadMeta = useCallback(async () => {
    if (!user) return;
    setLoadingMeta(true);
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('wallet_balance, verification_level, verification_status')
        .eq('id', user.id)
        .maybeSingle();
      if (profile) {
        setWalletBalance(Number((profile as any).wallet_balance || 0));
        const lvl = Number((profile as any).verification_level || 0);
        setVerifyLevel(lvl);
        setVerifyStatus(String((profile as any).verification_status || 'NOT_STARTED'));
      }

      const { data: settings } = await (supabase as any)
        .from('withdrawal_settings')
        .select('setting_key, setting_value');
      const map = new Map<string, number>();
      ((settings as any[]) || []).forEach((s) => map.set(s.setting_key, Number(s.setting_value)));
      const min = map.get('min_withdrawal_ngn') ?? 5000;
      const l2 = map.get('level2_monthly_limit_ngn') ?? 7000;
      const l3 = map.get('level3_monthly_limit_ngn') ?? 250000;
      setMinWithdrawal(min);
      setPerTxLimit(map.get('per_transaction_limit_ngn') ?? 0);
      setFeePercent(map.get('fee_percent') ?? 0);
      setFeeFlat(map.get('fee_flat_ngn') ?? 0);
      const lvl = Number((profile as any)?.verification_level || 0);
      setMonthlyLimit(lvl >= 3 ? l3 : l2);

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { data: monthRows } = await supabase
        .from('payment_requests')
        .select('amount, status')
        .eq('user_id', user.id)
        .gte('created_at', monthStart.toISOString());
      const used = ((monthRows as any[]) || [])
        .filter((r) => !['rejected', 'failed', 'cancelled'].includes(String(r.status || 'pending')))
        .reduce((s, r) => s + Number(r.amount || 0), 0);
      setMonthlyUsed(used);
    } finally {
      setLoadingMeta(false);
    }
  }, [user]);

  const loadRecords = useCallback(async () => {
    if (!user) return;
    setRecordsLoading(true);
    try {
      const { data } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setRecords((data as any[]) || []);
    } finally {
      setRecordsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && (open || embedded)) {
      loadMeta();
      loadRecords();
    }
  }, [user, open, embedded, loadMeta, loadRecords]);

  const canWithdraw = verifyLevel >= 2;
  const remainingMonthly = Math.max(0, monthlyLimit - monthlyUsed);

  const handleSubmit = async () => {
    if (!user) return;
    if (!canWithdraw) {
      toast({
        title: 'Verification required',
        description: 'Complete identity verification to unlock withdrawals.',
        variant: 'destructive',
      });
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    if (amountNum < minWithdrawal) {
      toast({
        title: 'Below minimum',
        description: `Minimum withdrawal is ${formatNgn(minWithdrawal)}.`,
        variant: 'destructive',
      });
      return;
    }
    if (amountNum > walletBalance) {
      toast({ title: 'Insufficient balance', variant: 'destructive' });
      return;
    }
    if (amountNum > remainingMonthly) {
      toast({
        title: 'Monthly limit',
        description: `You can withdraw up to ${formatNgn(remainingMonthly)} more this month.`,
        variant: 'destructive',
      });
      return;
    }
    if (perTxLimit > 0 && amountNum > perTxLimit) {
      toast({
        title: 'Per-transaction limit',
        description: `Max per request is ${formatNgn(perTxLimit)}.`,
        variant: 'destructive',
      });
      return;
    }

    let account_info: Record<string, string> = {};
    if (paymentMethod === 'bank_transfer') {
      if (!accountName || !accountNumber || !bankName) {
        toast({ title: 'Bank details required', variant: 'destructive' });
        return;
      }
      account_info = { account_name: accountName, account_number: accountNumber, bank_name: bankName };
    } else {
      if (!paymentHandle) {
        toast({ title: 'Payment handle required', variant: 'destructive' });
        return;
      }
      account_info = { handle: paymentHandle };
    }

    setLoading(true);
    try {
      const idem = `wd-${user.id}-${Date.now()}`;
      const { data, error } = await supabase.rpc('request_withdrawal' as any, {
        p_amount: amountNum,
        p_payment_method: paymentMethod,
        p_account_info: account_info,
        p_idempotency_key: idem,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.success === false) {
        toast({ title: 'Withdrawal blocked', description: res.error || 'Request failed', variant: 'destructive' });
        setLoading(false);
        return;
      }
      toast({
        title: 'Withdrawal requested',
        description: `Reserved ${formatNgn(amountNum)}. Net after fees: ${formatNgn(Number(res?.net ?? netPreview))}. Status: under review.`,
      });
      setWithdrawAmount('');
      await loadMeta();
      await loadRecords();
      setTab('records');
    } catch (e: any) {
      // Fallback insert without reserve if RPC missing
      try {
        const { error: insErr } = await supabase.from('payment_requests').insert({
          user_id: user.id,
          amount: amountNum,
          status: 'pending',
          payment_method: paymentMethod,
          account_info,
        } as any);
        if (insErr) throw insErr;
        toast({
          title: 'Request submitted',
          description: 'Run the Stage 4 SQL migration for balance reserve & limit enforcement.',
        });
        await loadRecords();
        setTab('records');
      } catch (e2: any) {
        toast({ title: 'Error', description: e2?.message || e?.message, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (s: string) => {
    const v = (s || 'pending').toLowerCase();
    const color =
      v === 'paid'
        ? 'bg-emerald-500/20 text-emerald-300'
        : v === 'rejected' || v === 'failed' || v === 'cancelled'
        ? 'bg-red-500/20 text-red-300'
        : v === 'processing'
        ? 'bg-sky-500/20 text-sky-300'
        : 'bg-amber-500/20 text-amber-200';
    return <Badge className={`border-0 ${color}`}>{v}</Badge>;
  };

  const body = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="request">Request</TabsTrigger>
        <TabsTrigger value="records">Records</TabsTrigger>
      </TabsList>

      <TabsContent value="request" className="space-y-4 mt-4">
        {loadingMeta ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Available</span>
                <span className="font-bold">{formatNgn(walletBalance)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Monthly limit (L{verifyLevel || 1})</span>
                <span>{formatNgn(monthlyUsed)} / {formatNgn(monthlyLimit)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Minimum</span>
                <span>{formatNgn(minWithdrawal)}</span>
              </div>
            </div>

            {!canWithdraw && (
              <Alert variant="destructive">
                <Shield className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Complete identity verification (Level 2) to unlock withdrawals. Status: {verifyStatus}.
                </AlertDescription>
              </Alert>
            )}

            {canWithdraw && walletBalance < minWithdrawal && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Your approved balance has not reached the {formatNgn(minWithdrawal)} minimum withdrawal.
                </AlertDescription>
              </Alert>
            )}

            <div>
              <Label>Amount (NGN)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder={String(minWithdrawal)}
                  disabled={!canWithdraw}
                />
                <Button type="button" variant="outline" disabled={!canWithdraw}
                  onClick={() => setWithdrawAmount(String(Math.min(walletBalance, remainingMonthly)))}>
                  Max
                </Button>
              </div>
              {amountNum > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Fee {formatNgn(feePreview)} · You receive ~{formatNgn(netPreview)}
                </p>
              )}
            </div>

            <div>
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="paystack">Paystack</SelectItem>
                  <SelectItem value="flutterwave">Flutterwave</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === 'bank_transfer' ? (
              <div className="space-y-2">
                <Alert>
                  <AlertDescription className="text-xs">
                    Wrong details can delay payment. Enter details exactly as on your bank account.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label>Account name</Label>
                  <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} className="mt-1" disabled={!canWithdraw} />
                </div>
                <div>
                  <Label>Account number</Label>
                  <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="mt-1" disabled={!canWithdraw} />
                </div>
                <div>
                  <Label>Bank name</Label>
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="mt-1" disabled={!canWithdraw} />
                </div>
              </div>
            ) : (
              <div>
                <Label>Payment email / handle</Label>
                <Input value={paymentHandle} onChange={(e) => setPaymentHandle(e.target.value)} className="mt-1" disabled={!canWithdraw} />
              </div>
            )}

            <Button onClick={handleSubmit} disabled={loading || !canWithdraw} className="w-full">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</> : 'Submit withdrawal'}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              Funds are reserved on submit. Paid only after admin confirmation. Processing up to 72 hours.
            </p>
          </>
        )}
      </TabsContent>

      <TabsContent value="records" className="mt-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="w-4 h-4" /> Your withdrawal records
        </div>
        {recordsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No withdrawal requests yet</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {records.map((r) => (
              <div key={r.id} className="rounded-xl border border-border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{formatNgn(Number(r.amount || 0))}</span>
                  {statusBadge(r.status)}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {r.created_at ? new Date(r.created_at).toLocaleString() : ''} · {r.payment_method || 'bank'}
                </p>
                {r.net_amount != null && (
                  <p className="text-[11px] text-muted-foreground">Net: {formatNgn(Number(r.net_amount))} · Fee: {formatNgn(Number(r.fee_amount || 0))}</p>
                )}
                {r.admin_notes && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-300">Note: {r.admin_notes}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border p-3 space-y-2 mt-3">
          <p className="text-xs font-semibold">Appeal a restriction</p>
          <p className="text-[11px] text-muted-foreground">
            If withdrawals or rewards were held, explain why this should be reviewed. Legitimate funds are not erased by risk holds.
          </p>
          <Input
            placeholder="Your appeal message…"
            value={appealMsg}
            onChange={(e) => setAppealMsg(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={appealSending || appealMsg.trim().length < 5}
            onClick={async () => {
              if (!user) return;
              setAppealSending(true);
              try {
                const { data, error } = await supabase.rpc('submit_appeal' as any, {
                  p_message: appealMsg.trim(),
                  p_case_id: null,
                  p_restriction_id: null,
                });
                if (error || (data as any)?.success === false) throw new Error(error?.message || (data as any)?.error);
                toast({ title: 'Appeal submitted' });
                setAppealMsg('');
              } catch (e: any) {
                // fallback insert
                try {
                  await (supabase as any).from('appeals').insert({ user_id: user.id, message: appealMsg.trim() });
                  toast({ title: 'Appeal submitted' });
                  setAppealMsg('');
                } catch (e2: any) {
                  toast({ title: 'Error', description: e2?.message || e?.message, variant: 'destructive' });
                }
              }
              setAppealSending(false);
            }}
          >
            {appealSending ? 'Sending…' : 'Submit appeal'}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );

  if (embedded) {
    return <div className="space-y-2">{body}</div>;
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="w-full gap-2">
        <Wallet className="w-4 h-4" /> Withdraw
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Withdrawals</DialogTitle>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WithdrawalForm;
