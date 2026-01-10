import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { 
  Share2, Copy, ArrowLeft, 
  MessageCircle, Instagram, Twitter, Facebook, Youtube
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SharePlatform = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);

  const platformUrl = window.location.origin;
  const referralUrl = user ? `${platformUrl}/?ref=${user.id.slice(0, 8)}` : platformUrl;

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('username, avatar_url')
      .eq('id', user.id)
      .single();
    setProfile(data);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralUrl);
    toast({ title: 'Copied!', description: 'Link copied to clipboard.' });
  };

  const shareToSocial = (platform: string) => {
    const shareText = profile 
      ? `Join me on SaveMore Community! 🎉 Follow @${profile.username} - ${referralUrl}`
      : `Join SaveMore Community! 🎉 The best social platform for earning! ${referralUrl}`;

    const urls: { [key: string]: string } = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralUrl)}&quote=${encodeURIComponent(shareText)}`,
      instagram: 'https://www.instagram.com/', // Instagram doesn't support direct sharing
      tiktok: `https://www.tiktok.com/`, // TikTok doesn't support direct sharing
      snapchat: `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(referralUrl)}`,
      youtube: 'https://www.youtube.com/', // YouTube doesn't support direct sharing
    };

    window.open(urls[platform], '_blank', 'width=600,height=400');
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Share2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Share SaveMore</h1>
        </div>
      </div>

      {/* Profile Preview Card */}
      {profile && (
        <Card className="glass-card overflow-hidden">
          <div className="bg-gradient-to-r from-primary/20 to-primary/5 p-6">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16 border-2 border-primary">
                <AvatarImage src={profile.avatar_url} />
                <AvatarFallback className="text-xl">{profile.username?.[0]}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-bold">@{profile.username}</h2>
                <p className="text-sm text-muted-foreground">SaveMore Community</p>
              </div>
            </div>
          </div>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Join me on SaveMore Community! Earn while you browse, share content, and connect with amazing people.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Copy Link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Share Link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={referralUrl}
              readOnly
              className="flex-1 px-3 py-2 text-sm border rounded-md bg-muted"
            />
            <Button onClick={copyLink}>
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Social Share Buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Share to Social Media</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="outline" 
              className="h-12 justify-start gap-3"
              onClick={() => shareToSocial('whatsapp')}
            >
              <MessageCircle className="h-5 w-5 text-green-500" />
              WhatsApp
            </Button>
            <Button 
              variant="outline" 
              className="h-12 justify-start gap-3"
              onClick={() => shareToSocial('twitter')}
            >
              <Twitter className="h-5 w-5 text-blue-400" />
              X (Twitter)
            </Button>
            <Button 
              variant="outline" 
              className="h-12 justify-start gap-3"
              onClick={() => shareToSocial('facebook')}
            >
              <Facebook className="h-5 w-5 text-blue-600" />
              Facebook
            </Button>
            <Button 
              variant="outline" 
              className="h-12 justify-start gap-3"
              onClick={() => shareToSocial('instagram')}
            >
              <Instagram className="h-5 w-5 text-pink-500" />
              Instagram
            </Button>
            <Button 
              variant="outline" 
              className="h-12 justify-start gap-3"
              onClick={() => shareToSocial('tiktok')}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
              TikTok
            </Button>
            <Button 
              variant="outline" 
              className="h-12 justify-start gap-3"
              onClick={() => shareToSocial('snapchat')}
            >
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.076-.375-.09-.84-.181-1.381-.181-.12 0-.24 0-.358.016-.596.044-1.125.254-1.722.494-.675.27-1.433.584-2.459.584-.045 0-.089 0-.119-.014-.045.014-.09.014-.135.014-1.032 0-1.792-.313-2.459-.584-.602-.24-1.126-.45-1.72-.494-.12-.016-.24-.016-.36-.016-.543 0-1.005.091-1.38.181-.226.045-.404.076-.54.076-.344 0-.508-.166-.555-.405-.061-.193-.09-.375-.135-.553-.045-.195-.105-.479-.165-.57-1.873-.283-2.906-.702-3.147-1.271-.029-.075-.044-.149-.044-.225-.016-.24.164-.465.419-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.015c.18-.345.224-.645.119-.869-.195-.449-.884-.675-1.332-.81-.12-.044-.24-.09-.346-.119-.823-.329-1.227-.719-1.212-1.168 0-.36.284-.69.733-.839.15-.06.313-.09.51-.09.12 0 .299.016.463.104.37.181.733.285 1.035.3.197 0 .329-.045.4-.09-.006-.165-.017-.33-.028-.51l-.004-.06c-.104-1.628-.23-3.654.299-4.847C7.858 1.069 11.216.793 12.206.793"/>
              </svg>
              Snapchat
            </Button>
            <Button 
              variant="outline" 
              className="h-12 justify-start gap-3 col-span-2"
              onClick={() => shareToSocial('youtube')}
            >
              <Youtube className="h-5 w-5 text-red-500" />
              YouTube
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        When friends join using your link, you may earn referral bonuses!
      </p>
    </div>
  );
};

export default SharePlatform;
