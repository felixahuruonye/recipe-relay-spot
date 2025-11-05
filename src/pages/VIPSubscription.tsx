import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Star, CheckCircle, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const VIPSubscription = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (data) setUserProfile(data);
    setLoading(false);
  };

  const handleSubscribe = async (plan: string) => {
    toast({
      title: "VIP Subscription",
      description: "Contact admin to activate VIP subscription"
    });
  };

  const benefits = [
    { icon: Star, text: "Earn +5 stars for every approved post" },
    { icon: Crown, text: "VIP badge on your profile" },
    { icon: Zap, text: "Priority support and faster approvals" },
    { icon: CheckCircle, text: "Access to exclusive VIP-only features" },
    { icon: Star, text: "Higher earning potential from content" },
    { icon: Crown, text: "Ad-free browsing experience" }
  ];

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6 pb-20">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold gradient-text flex items-center justify-center gap-2">
          <Crown className="w-8 h-8" />
          VIP Membership
        </h1>
        <p className="text-muted-foreground">Unlock premium benefits and maximize your earnings</p>
      </div>

      {/* Current Status */}
      {userProfile && (
        <Card className={`glass-card ${userProfile.is_vip ? 'border-yellow-500' : 'border-border'}`}>
          <CardContent className="pt-6">
            <div className="text-center">
              <Badge variant={userProfile.is_vip ? "default" : "secondary"} className="mb-2">
                {userProfile.is_vip ? "VIP ACTIVE" : "FREE MEMBER"}
              </Badge>
              {userProfile.is_vip && userProfile.vip_expires_at && (
                <p className="text-sm text-muted-foreground">
                  Expires: {new Date(userProfile.vip_expires_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* VIP Benefits */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5" />
            VIP Benefits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center gap-3 p-3 rounded-lg glass-card">
                <benefit.icon className="w-5 h-5 text-yellow-500" />
                <span className="text-sm">{benefit.text}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subscription Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { name: "Monthly", price: 5000, stars: 50, period: "month" },
          { name: "Quarterly", price: 12000, stars: 150, period: "3 months", badge: "Save 20%" },
          { name: "Yearly", price: 40000, stars: 600, period: "year", badge: "Best Value" }
        ].map((plan) => (
          <Card key={plan.name} className={`glass-card hover:border-primary/50 transition-all ${plan.badge ? 'border-primary/30' : ''}`}>
            <CardHeader>
              <div className="text-center space-y-2">
                {plan.badge && <Badge className="mb-2">{plan.badge}</Badge>}
                <CardTitle>{plan.name}</CardTitle>
                <div>
                  <p className="text-3xl font-bold">₦{plan.price.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">per {plan.period}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Includes</p>
                <p className="text-lg font-semibold flex items-center justify-center gap-1">
                  <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                  {plan.stars} Bonus Stars
                </p>
              </div>
              <Button 
                onClick={() => handleSubscribe(plan.name)} 
                className="w-full"
                variant={userProfile?.is_vip ? "outline" : "default"}
                disabled={userProfile?.is_vip}
              >
                {userProfile?.is_vip ? "Already VIP" : "Subscribe Now"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FAQ */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-1">How do I earn from VIP?</h3>
            <p className="text-sm text-muted-foreground">
              VIP members earn +5 stars automatically for every post that gets approved. These stars can be converted to wallet balance or used to unlock content.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Can I cancel anytime?</h3>
            <p className="text-sm text-muted-foreground">
              Yes! VIP membership can be cancelled at any time. You'll retain VIP benefits until the end of your billing period.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">What happens to my stars if I cancel?</h3>
            <p className="text-sm text-muted-foreground">
              All stars you've earned remain in your account and can still be used or converted to wallet balance.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VIPSubscription;
