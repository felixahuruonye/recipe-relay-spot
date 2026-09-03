import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Zap, Brain, Settings, CheckCircle, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LenoryAISettings {
  ai_enabled: boolean;
  connected: boolean;
  api_key?: string;
}

const ConnectLenoryAI = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<LenoryAISettings>({
    ai_enabled: false,
    connected: false,
  });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchLenoryAISettings();
    }
  }, [user?.id]);

  const fetchLenoryAISettings = async () => {
    if (!user?.id) return;
    try {
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('story_settings')
        .eq('id', user.id)
        .single();

      const storySettings = profileData?.story_settings as any;
      setSettings({
        ai_enabled: storySettings?.ai_enabled || false,
        connected: storySettings?.lenory_ai_connected || false,
        api_key: storySettings?.lenory_ai_api_key,
      });
    } catch (error) {
      console.error('Error fetching Lenory AI settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAI = async (enabled: boolean) => {
    if (!user?.id) return;
    try {
      const { data: current } = await supabase
        .from('user_profiles')
        .select('story_settings')
        .eq('id', user.id)
        .single();

      const existing = (current?.story_settings as any) || {};
      await supabase
        .from('user_profiles')
        .update({
          story_settings: { ...existing, ai_enabled: enabled },
        })
        .eq('id', user.id);

      setSettings(prev => ({ ...prev, ai_enabled: enabled }));
      toast({
        title: enabled ? 'Lenory AI Enabled' : 'Lenory AI Disabled',
        description: enabled 
          ? 'Your posts will now be enhanced with AI features'
          : 'AI features are now disabled for your posts',
      });
    } catch (error) {
      console.error('Error toggling AI:', error);
      toast({ title: 'Error', description: 'Failed to update settings', variant: 'destructive' });
    }
  };

  const handleConnectLenoryAI = async () => {
    if (!user?.id) return;
    setConnecting(true);
    try {
      // TODO: Implement actual OAuth flow with Lenory AI
      const { data: current } = await supabase
        .from('user_profiles')
        .select('story_settings')
        .eq('id', user.id)
        .single();

      const existing = (current?.story_settings as any) || {};
      await supabase
        .from('user_profiles')
        .update({
          story_settings: { 
            ...existing, 
            lenory_ai_connected: true,
            lenory_ai_api_key: 'temp_' + Math.random().toString(36).substr(2, 9)
          },
        })
        .eq('id', user.id);

      setSettings(prev => ({ ...prev, connected: true }));
      toast({
        title: 'Connected!',
        description: 'Lenory AI has been successfully connected to your account',
      });
    } catch (error) {
      console.error('Error connecting Lenory AI:', error);
      toast({ title: 'Error', description: 'Failed to connect Lenory AI', variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user?.id) return;
    if (!confirm('Are you sure you want to disconnect Lenory AI?')) return;

    try {
      const { data: current } = await supabase
        .from('user_profiles')
        .select('story_settings')
        .eq('id', user.id)
        .single();

      const existing = (current?.story_settings as any) || {};
      await supabase
        .from('user_profiles')
        .update({
          story_settings: { 
            ...existing, 
            lenory_ai_connected: false,
            ai_enabled: false,
          },
        })
        .eq('id', user.id);

      setSettings(prev => ({ ...prev, connected: false, ai_enabled: false }));
      toast({
        title: 'Disconnected',
        description: 'Lenory AI has been disconnected from your account',
      });
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast({ title: 'Error', description: 'Failed to disconnect', variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Brain className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold gradient-text">Connect Lenory AI</h1>
          <p className="text-sm text-muted-foreground">Integrate AI-powered features into your content</p>
        </div>
      </div>

      {/* Connection Status Card */}
      <Card className={`glass-card border-2 ${settings.connected ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {settings.connected ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Connected
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Not Connected
                </>
              )}
            </CardTitle>
            <Badge variant={settings.connected ? 'default' : 'outline'}>
              {settings.connected ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {settings.connected
              ? 'Lenory AI is integrated with your account. You can now use advanced AI features to enhance your content.'
              : 'Connect Lenory AI to access powerful features like content generation, smart recommendations, and audience insights.'}
          </p>

          <div className="flex gap-3">
            {!settings.connected ? (
              <Button
                onClick={handleConnectLenoryAI}
                disabled={connecting}
                className="gap-2"
              >
                <Zap className="h-4 w-4" />
                {connecting ? 'Connecting...' : 'Connect Lenory AI'}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleDisconnect}>
                  Disconnect
                </Button>
                <Button variant="outline">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Go to Lenory AI Dashboard
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Features Card */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Available Features
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: 'Smart Captions', description: 'Auto-generate engaging captions for your posts' },
              { title: 'Content Suggestions', description: 'AI-powered recommendations for trending content' },
              { title: 'Audience Insights', description: 'Deep analytics on your audience behavior' },
              { title: 'Voice Commands', description: 'Control features with voice input' },
              { title: 'Auto-Tagging', description: 'Intelligent hashtag and category suggestions' },
              { title: 'Trending Analysis', description: 'Real-time trend monitoring and alerts' },
            ].map((feature, index) => (
              <div key={index} className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{feature.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Settings Card */}
      {settings.connected && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              AI Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-lg border border-primary/20 bg-primary/5">
              <div>
                <Label className="text-base font-medium cursor-pointer">Enable AI Features</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Turn on AI-powered features for your content
                </p>
              </div>
              <Switch
                checked={settings.ai_enabled}
                onCheckedChange={handleToggleAI}
                disabled={!settings.connected}
              />
            </div>

            {settings.ai_enabled && (
              <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  ✨ AI features are now active. Your posts will be automatically enhanced with smart suggestions and analysis.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Benefits Card */}
      <Card className="glass-card border-primary/30">
        <CardHeader>
          <CardTitle>Why Connect Lenory AI?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <div className="text-2xl">🚀</div>
            <div>
              <p className="font-medium">Boost Your Reach</p>
              <p className="text-sm text-muted-foreground">AI-optimized content gets more engagement</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-2xl">⏰</div>
            <div>
              <p className="font-medium">Save Time</p>
              <p className="text-sm text-muted-foreground">Automate content creation and scheduling</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-2xl">📊</div>
            <div>
              <p className="font-medium">Better Analytics</p>
              <p className="text-sm text-muted-foreground">Get deep insights into your performance</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-2xl">💡</div>
            <div>
              <p className="font-medium">Smart Suggestions</p>
              <p className="text-sm text-muted-foreground">Get personalized recommendations for growth</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectLenoryAI;
