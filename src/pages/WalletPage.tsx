import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WalletBalance } from '@/components/Wallet/WalletBalance';
import StarMarketplace from '@/pages/StarMarketplace';
import { Wallet as WalletIcon, Star, CreditCard } from 'lucide-react';
import { WatchAdToEarn } from '@/components/Ads/WatchAdToEarn';
import { WithdrawalForm } from '@/components/Profile/WithdrawalForm';
import { useAuth } from '@/contexts/AuthContext';

const WalletPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <Tabs defaultValue="wallet" className="w-full">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-3 pt-3 pb-2">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="wallet" className="gap-2"><WalletIcon className="w-4 h-4" />Wallet</TabsTrigger>
            <TabsTrigger value="withdrawal" className="gap-2"><CreditCard className="w-4 h-4" />Withdraw</TabsTrigger>
            <TabsTrigger value="buy" className="gap-2"><Star className="w-4 h-4" />Buy Stars</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="wallet" className="p-4 space-y-4">
          <WalletBalance />
          <div className="flex justify-center">
            <WatchAdToEarn className="w-full max-w-sm" />
          </div>
        </TabsContent>
        <TabsContent value="withdrawal" className="p-4">
          {user?.id && <WithdrawalForm userId={user.id} />}
        </TabsContent>
        <TabsContent value="buy" className="p-0"><StarMarketplace /></TabsContent>
      </Tabs>
    </div>
  );
};

export default WalletPage;
