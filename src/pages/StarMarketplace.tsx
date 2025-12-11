import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Wallet, Package, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface StarPackage {
  id: string;
  stars: number;
  price_naira: number;
  notes: string;
  purchase_url: string;
}

const StarMarketplace = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [packages, setPackages] = useState<StarPackage[]>([]);
  const [userBalance, setUserBalance] = useState({ stars: 0, wallet: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPackages();
    if (user) {
      loadUserBalance();
    }
  }, [user]);

  const loadPackages = async () => {
    const { data } = await supabase
      .from('star_packages')
      .select('*')
      .eq('status', 'enabled')
      .order('stars', { ascending: true });
    
    if (data) setPackages(data as StarPackage[]);
    setLoading(false);
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
  };

  const handlePurchase = (pkg: StarPackage) => {
    if (pkg.purchase_url) {
      window.open(pkg.purchase_url, '_blank');
    } else {
      toast({
        title: "Purchase Stars",
        description: `Contact admin to purchase ${pkg.stars} stars for ₦${pkg.price_naira.toLocaleString()}`
      });
    }
  };

  const formatPrice = (price: number) => {
    if (price >= 1000000000) {
      return `₦${(price / 1000000000).toFixed(1)}B`;
    } else if (price >= 1000000) {
      return `₦${(price / 1000000).toFixed(1)}M`;
    } else if (price >= 1000) {
      return `₦${(price / 1000).toFixed(0)}K`;
    }
    return `₦${price.toLocaleString()}`;
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
      {user && (
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
      )}

      {/* Star Prices Section */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Package className="w-6 h-6" />
          Star Prices
        </h2>
        
        <Card className="glass-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-4 font-semibold">Stars</th>
                    <th className="text-left p-4 font-semibold">Price (₦)</th>
                    <th className="text-left p-4 font-semibold">Notes</th>
                    <th className="text-right p-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg) => (
                    <tr key={pkg.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                          <span className="font-semibold">{pkg.stars.toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-bold text-primary">{formatPrice(pkg.price_naira)}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-muted-foreground">{pkg.notes}</span>
                      </td>
                      <td className="p-4 text-right">
                        <Button 
                          size="sm" 
                          onClick={() => handlePurchase(pkg)}
                          className="gap-1"
                        >
                          Buy Now
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <p>🎁 Get <span className="text-primary font-bold">35% cashback</span> when you view paid content</p>
          <p>📈 Creators earn <span className="text-primary font-bold">40%</span> from their content</p>
          <p>🔄 Convert stars to wallet balance or vice versa</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default StarMarketplace;