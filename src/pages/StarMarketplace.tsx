import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Wallet, TrendingUp, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface StarPackage {
  id: string;
  stars: number;
  price_naira: number;
  price_usd: number;
  note: string;
  status: string;
}

const StarMarketplace = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [packages, setPackages] = useState<StarPackage[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [userBalance, setUserBalance] = useState({ stars: 0, wallet: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadPackages();
      loadRates();
      loadUserBalance();
    }
  }, [user]);

  const loadPackages = async () => {
    const { data } = await supabase
      .from('star_market')
      .select('*')
      .eq('status', 'enabled')
      .order('stars', { ascending: true });
    
    if (data) setPackages(data);
  };

  const loadRates = async () => {
    const { data } = await supabase
      .from('star_rates')
      .select('*')
      .eq('status', 'enabled')
      .order('stars', { ascending: true });
    
    if (data) setRates(data);
  };

  const loadUserBalance = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('star_balance, wallet_balance')
      .eq('id', user.id)
      .single();
    
    if (data) {
      setUserBalance({ stars: data.star_balance || 0, wallet: data.wallet_balance || 0 });
    }
    setLoading(false);
  };

  const handlePurchase = (packageItem: StarPackage) => {
    toast({
      title: "Purchase Stars",
      description: `Contact admin to purchase ${packageItem.stars} stars for ₦${packageItem.price_naira.toLocaleString()}`
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Star Marketplace</h1>
          <p className="text-muted-foreground">Purchase stars to unlock premium content</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/profile')}>
          <Wallet className="w-4 h-4 mr-2" />
          View Wallet
        </Button>
      </div>

      {/* User Balance Card */}
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Your Balances
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 fill-yellow-500 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{userBalance.stars}</p>
                <p className="text-xs text-muted-foreground">Stars</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">₦{userBalance.wallet.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Wallet</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Star Packages */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Package className="w-6 h-6" />
          Star Packages
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <Card key={pkg.id} className="glass-card hover:border-primary/50 transition-all">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Star className="w-6 h-6 fill-yellow-500 text-yellow-500" />
                    <CardTitle>{pkg.stars} Stars</CardTitle>
                  </div>
                  {pkg.note && <Badge variant="secondary">{pkg.note}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-3xl font-bold">₦{pkg.price_naira.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">${pkg.price_usd.toFixed(2)} USD</p>
                </div>
                <Button onClick={() => handlePurchase(pkg)} className="w-full">
                  Purchase Now
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Live Star Rates */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          Live Star Rates
        </h2>
        <Card className="glass-card">
          <CardContent className="p-0">
            <div className="divide-y">
              {rates.map((rate) => (
                <div key={rate.id} className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <Star className="w-5 h-5 fill-yellow-500 text-yellow-500" />
                    <span className="font-semibold">{rate.stars} Stars</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">₦{rate.price_naira.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">${rate.price_usd.toFixed(2)} USD</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Section */}
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle>How Stars Work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>⭐ Use stars to unlock premium stories and content</p>
          <p>💰 Each star = ₦500 (approx $0.33 USD)</p>
          <p>🎁 Get 20% cashback when you view paid content</p>
          <p>📈 VIP members earn +5 stars for each approved post</p>
          <p>🔄 Convert stars to wallet balance or vice versa</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default StarMarketplace;
