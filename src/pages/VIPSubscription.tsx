import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Star, CheckCircle, Zap, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const VIPSubscription = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (user) {
      loadProfile();
    }
    loadSettings();
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

  const loadSettings = async () => {
    const { data } = await supabase
      .from('admin_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['vip_30_days_url', 'vip_60_days_url', 'vip_bonus_enabled']);
    
    if (data) {
      const settingsMap: {[key: string]: string} = {};
      data.forEach((s: any) => {
        settingsMap[s.setting_key] = s.setting_value;
      });
      setSettings(settingsMap);
    }
  };

  const handleSubscribe = async (days: number) => {
    const urlKey = days === 30 ? 'vip_30_days_url' : 'vip_60_days_url';
    const url = settings[urlKey];
    
    if (url) {
      window.open(url, '_blank');
    } else {
      toast({
        title: "VIP Subscription",
        description: "Contact admin to activate VIP subscription"
      });
    }
  };

  const getVIPStatus = () => {
    if (!userProfile) return { status: 'FREE MEMBER', days: 0, badge: 'secondary' as const };
    
    if (!userProfile.is_vip) return { status: 'FREE MEMBER', days: 0, badge: 'secondary' as const };
    
    const vipDays = userProfile.vip_days || 0;
    if (vipDays === 30) {
      return { status: 'VIP 30 DAYS', days: 30, badge: 'default' as const };
    } else if (vipDays === 60) {
      return { status: 'VIP 60 DAYS', days: 60, badge: 'default' as const };
    }
    return { status: 'VIP ACTIVE', days: vipDays, badge: 'default' as const };
  };

  const getDaysRemaining = () => {
    if (!userProfile?.vip_expires_at) return 0;
    const expires = new Date(userProfile.vip_expires_at);
    const now = new Date();
    const diff = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const vipStatus = getVIPStatus();
  const daysRemaining = getDaysRemaining();

  const benefits = [
    { icon: Star, text: "Earn +5 stars for every approved post" },
    { icon: Crown, text: "VIP badge on your profile" },
    { icon: Zap, text: "Priority support and faster approvals" },
    { icon: CheckCircle, text: "Access to exclusive VIP-only features" },
    { icon: Star, text: "Higher earning potential from content" },
    { icon: Crown, text: "Ad-free browsing experience" }
  ];

  const plans = [
    { 
      name: "30 Days VIP", 
      price: 1500, 
      stars: 3, 
      days: 30,
      period: "30 days" 
    },
    { 
      name: "60 Days VIP", 
      price: 2500, 
      stars: 5, 
      days: 60,
      period: "60 days",
      badge: "Best Value" 
    }
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
            <div className="text-center space-y-2">
              <Badge variant={vipStatus.badge} className={`mb-2 text-lg px-4 py-1 ${userProfile.is_vip ? 'bg-yellow-500 text-black' : ''}`}>
                {userProfile.is_vip && <Crown className="w-4 h-4 mr-1 inline" />}
                {vipStatus.status}
              </Badge>
              {userProfile.is_vip && daysRemaining > 0 && (
                <p className="text-sm text-muted-foreground">
                  {daysRemaining} days remaining • Expires: {new Date(userProfile.vip_expires_at).toLocaleDateString()}
                </p>
              )}
              {!userProfile.is_vip && (
                <p className="text-sm text-muted-foreground">
                  Upgrade to VIP to unlock all premium features!
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((plan) => (
          <Card key={plan.name} className={`glass-card hover:border-primary/50 transition-all ${plan.badge ? 'border-primary/30' : ''}`}>
            <CardHeader>
              <div className="text-center space-y-2">
                {plan.badge && <Badge className="mb-2 bg-primary">{plan.badge}</Badge>}
                <CardTitle>{plan.name}</CardTitle>
                <div>
                  <p className="text-3xl font-bold">₦{plan.price.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">for {plan.period}</p>
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
                <p className="text-xs text-muted-foreground mt-1">
                  (Added when admin activates bonus)
                </p>
              </div>
              <Button 
                onClick={() => handleSubscribe(plan.days)} 
                className="w-full gap-2"
                variant={userProfile?.is_vip ? "outline" : "default"}
                disabled={userProfile?.is_vip && daysRemaining > 0}
              >
                {userProfile?.is_vip && daysRemaining > 0 ? "Already VIP" : (
                  <>
                    Subscribe Now
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
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