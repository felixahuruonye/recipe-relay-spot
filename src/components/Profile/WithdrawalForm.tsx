import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Wallet, AlertTriangle, Crown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type PaymentMethod = 'bank_transfer' | 'paystack' | 'flutterwave';

type WithdrawalFormProps = {
  isVip?: boolean;
  onUpgrade?: () => void;
};

export const WithdrawalForm: React.FC<WithdrawalFormProps> = ({ isVip = false, onUpgrade }) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [vipPromptOpen, setVipPromptOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [walletBalance, setWalletBalance] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');

  // Bank transfer fields
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');

  // Other methods
  const [paymentHandle, setPaymentHandle] = useState('');

  const [attemptCount, setAttemptCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockEndTime, setLockEndTime] = useState<Date | null>(null);

  const minWithdrawal = 1000;

  const lockKey = useMemo(() => (user ? `withdrawal_lock_${user.id}` : ''), [user]);

  useEffect(() => {
    if (user && open) {
      loadWalletBalance();
      checkLockStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, open]);

  const loadWalletBalance = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_profiles')
      .select('wallet_balance')
      .eq('id', user.id)
      .single();

    if (data) {
      setWalletBalance(data.wallet_balance || 0);
    }
  };

  const checkLockStatus = async () => {
    if (!user || !lockKey) return;

    const lockData = localStorage.getItem(lockKey);

    if (lockData) {
      const lockEnd = new Date(lockData);
      if (lockEnd > new Date()) {
        setIsLocked(true);
        setLockEndTime(lockEnd);
      } else {
        localStorage.removeItem(lockKey);
        setAttemptCount(0);
      }
    }
  };

  const handleOpen = () => {
    if (!user) {
      toast({ title: 'Login required', description: 'Please login to request payment.', variant: 'destructive' });
      return;
    }

    if (!isVip) {
      setVipPromptOpen(true);
      return;
    }

    setOpen(true);
  };

  const handleWithdrawAll = () => {
    setWithdrawAmount(walletBalance.toString());
  };

  const validateAmount = () => {
    const amount = Number(withdrawAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid amount', variant: 'destructive' });
      return false;
    }

    if (amount > walletBalance) {
      const newAttemptCount = attemptCount + 1;
      setAttemptCount(newAttemptCount);

      if (newAttemptCount >= 3) {
        const lockEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
        localStorage.setItem(lockKey, lockEnd.toISOString());
        setIsLocked(true);
        setLockEndTime(lockEnd);

        toast({
          title: 'Wallet Locked',
          description: 'Too many incorrect attempts. Wallet locked for 24 hours.',
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Invalid Amount',
          description: `Amount exceeds balance. ${3 - newAttemptCount} attempts remaining.`,
          variant: 'destructive'
        });
      }

      setWithdrawAmount('');
      return false;
    }

    if (amount < minWithdrawal) {
      toast({
        title: 'Balance Too Low',
        description: `Minimum withdrawal amount is ₦${minWithdrawal.toLocaleString()}`,
        variant: 'destructive'
      });
      return false;
    }

    if (paymentMethod === 'bank_transfer') {
      if (!accountName || !accountNumber || !bankName) {
        toast({ title: 'Error', description: 'Please fill all bank details', variant: 'destructive' });
        return false;
      }
    } else {
      if (!paymentHandle) {
        toast({ title: 'Error', description: 'Please provide your payment email/handle', variant: 'destructive' });
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (isLocked) {
      toast({ title: 'Wallet Locked', description: 'Please wait 24 hours', variant: 'destructive' });
      return;
    }

    if (!user) return;

    if (!validateAmount()) return;

    setLoading(true);

    try {
      const amount = Number(withdrawAmount);

      const account_info =
        paymentMethod === 'bank_transfer'
          ? { account_name: accountName, account_number: accountNumber, bank_name: bankName }
          : { handle: paymentHandle };

      const { error } = await supabase
        .from('payment_requests')
        .insert({
          user_id: user.id,
          amount,
          payment_method: paymentMethod,
          currency_symbol: '₦',
          account_info,
          status: 'pending'
        } as any);

      if (error) throw error;

      await supabase.from('user_notifications').insert({
        user_id: user.id,
        title: 'Withdrawal Request Submitted',
        message: `Your withdrawal request for ₦${amount.toLocaleString()} has been submitted. Processing time: 72 hours.`,
        type: 'info',
        notification_category: 'withdrawal'
      } as any);

      toast({ title: 'Success', description: 'Withdrawal request submitted!' });
      setOpen(false);
      resetForm();
    } catch (error) {
      console.error('Withdrawal error:', error);
      toast({ title: 'Error', description: 'Failed to submit withdrawal', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setWithdrawAmount('');
    setPaymentMethod('bank_transfer');
    setAccountName('');
    setAccountNumber('');
    setBankName('');
    setPaymentHandle('');
    setAttemptCount(0);
  };

  return (
    <>
      <Button onClick={handleOpen} className="w-full btn-3d" variant="outline">
        <Wallet className="mr-2 h-4 w-4" />
        Request Payment
      </Button>

      {/* VIP prompt */}
      <Dialog open={vipPromptOpen} onOpenChange={setVipPromptOpen}>
        <DialogContent className="max-w-md glass-card">
          <DialogHeader>
            <DialogTitle className="gradient-text">VIP Required</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Only VIP members can withdraw. Upgrade to VIP now and try again.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                setVipPromptOpen(false);
                if (onUpgrade) onUpgrade();
                else window.location.assign('/vip-subscription');
              }}
            >
              <Crown className="mr-2 h-4 w-4" />
              Upgrade to VIP
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto glass-card">
          <DialogHeader>
            <DialogTitle className="gradient-text">Withdraw Funds</DialogTitle>
          </DialogHeader>

          {isLocked && lockEndTime && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Wallet locked until {lockEndTime.toLocaleString()}. Too many incorrect withdrawal attempts.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="glass-card p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-2xl font-bold gradient-text">₦{walletBalance.toLocaleString()}</p>
            </div>

            <div>
              <Label htmlFor="amount">Withdrawal Amount</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  disabled={isLocked}
                />
                <Button onClick={handleWithdrawAll} variant="outline" disabled={isLocked}>
                  All
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Minimum: ₦{minWithdrawal.toLocaleString()}</p>
            </div>

            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="paystack">Paystack</SelectItem>
                  <SelectItem value="flutterwave">Flutterwave</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === 'bank_transfer' ? (
              <>
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    ⚠️ Wrong details can slow down payment. Please add correct details to receive payment.
                  </AlertDescription>
                </Alert>

                <div>
                  <Label htmlFor="account-name">Account Name</Label>
                  <Input
                    id="account-name"
                    placeholder="Full name on account"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    disabled={isLocked}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="account-number">Account Number</Label>
                  <Input
                    id="account-number"
                    placeholder="10-digit account number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    disabled={isLocked}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="bank-name">Bank Name</Label>
                  <Input
                    id="bank-name"
                    placeholder="e.g., GTBank, First Bank, etc."
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    disabled={isLocked}
                    className="mt-1"
                  />
                </div>
              </>
            ) : (
              <div>
                <Label htmlFor="payment-handle">Payment Email/Handle</Label>
                <Input
                  id="payment-handle"
                  placeholder={paymentMethod === 'paystack' ? 'Paystack email' : 'Flutterwave email/handle'}
                  value={paymentHandle}
                  onChange={(e) => setPaymentHandle(e.target.value)}
                  disabled={isLocked}
                  className="mt-1"
                />
              </div>
            )}

            <Button onClick={handleSubmit} disabled={loading || isLocked} className="w-full btn-3d">
              {loading ? 'Submitting...' : 'Submit Request'}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Processing time: 72 hours | You'll be notified of status updates
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

