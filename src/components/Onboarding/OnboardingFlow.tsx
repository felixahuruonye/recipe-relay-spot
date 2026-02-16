import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, ArrowRight, Star, BookOpen, UserCircle } from 'lucide-react';

interface OnboardingFlowProps {
  onComplete: () => void;
}

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState({
    fullName: '',
    age: '',
    location: '',
    interest: '',
    howFound: '',
    goal: '',
  });
  const [profileData, setProfileData] = useState({ full_name: '', bio: '', avatar_url: '' });

  const submitQuestions = async () => {
    if (!user) return;
    // Send answers to admin
    await supabase.from('admin_notifications').insert({
      title: '🆕 New User Introduction',
      message: `Name: ${answers.fullName}\nAge: ${answers.age}\nLocation: ${answers.location}\nInterest: ${answers.interest}\nHow found us: ${answers.howFound}\nGoal: ${answers.goal}`,
      type: 'new_user',
      user_id: user.id,
      user_email: user.email,
    });
    setStep(2);
  };

  const saveProfile = async () => {
    if (!user) return;
    await supabase.from('user_profiles').update({
      full_name: profileData.full_name,
      bio: profileData.bio,
    }).eq('id', user.id);
    setStep(4);
  };

  // Step 1: Questions
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background p-4 overflow-y-auto pb-24">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle className="text-center text-xl">👋 Welcome to SaveMore!</CardTitle>
            <p className="text-center text-muted-foreground text-sm">Tell us a bit about yourself</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>What's your full name?</Label>
              <Input value={answers.fullName} onChange={e => setAnswers(p => ({ ...p, fullName: e.target.value }))} placeholder="Enter your name" />
            </div>
            <div>
              <Label>How old are you?</Label>
              <Input value={answers.age} onChange={e => setAnswers(p => ({ ...p, age: e.target.value }))} placeholder="Your age" type="number" />
            </div>
            <div>
              <Label>Where are you from?</Label>
              <Input value={answers.location} onChange={e => setAnswers(p => ({ ...p, location: e.target.value }))} placeholder="City, Country" />
            </div>
            <div>
              <Label>What interests you most?</Label>
              <Select value={answers.interest} onValueChange={v => setAnswers(p => ({ ...p, interest: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="earning">Earning money</SelectItem>
                  <SelectItem value="socializing">Meeting people</SelectItem>
                  <SelectItem value="content">Creating content</SelectItem>
                  <SelectItem value="shopping">Shopping / Marketplace</SelectItem>
                  <SelectItem value="all">All of the above</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>How did you find SaveMore?</Label>
              <Input value={answers.howFound} onChange={e => setAnswers(p => ({ ...p, howFound: e.target.value }))} placeholder="Friend, social media, etc." />
            </div>
            <div>
              <Label>What's your main goal here?</Label>
              <Textarea value={answers.goal} onChange={e => setAnswers(p => ({ ...p, goal: e.target.value }))} placeholder="Tell us what you hope to achieve..." />
            </div>
            <Button className="w-full" onClick={submitQuestions} disabled={!answers.fullName.trim()}>
              Continue <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2: Welcome & Tutorial
  if (step === 2) {
    return (
      <div className="min-h-screen bg-background p-4 overflow-y-auto pb-24">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle className="text-center text-xl flex items-center justify-center gap-2">
              <BookOpen className="w-5 h-5" /> Welcome to SaveMore 🤗
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed">
            <div className="bg-primary/10 p-4 rounded-lg">
              <h3 className="font-bold mb-2">🏠 What is SaveMore Community?</h3>
              <p>SaveMore is a social platform where you can connect with others, share content, and <strong>earn real money</strong> from your posts, stories, and interactions.</p>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-bold mb-2">📱 How to Navigate</h3>
              <ul className="space-y-1 list-disc pl-4">
                <li><strong>Home:</strong> View posts, like, comment, and earn from content</li>
                <li><strong>Groups:</strong> Join or create communities</li>
                <li><strong>Explore:</strong> Discover trending content and creators</li>
                <li><strong>Chat:</strong> Private messaging with other users</li>
                <li><strong>Menu:</strong> Access Marketplace, VIP, Wallet, Settings & more</li>
              </ul>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-bold mb-2">💰 How to Earn</h3>
              <ul className="space-y-1 list-disc pl-4">
                <li>Post content and set Star prices — viewers pay to watch, you earn!</li>
                <li>Upload Storylines — set a price, earn when people view</li>
                <li>Complete marketplace tasks and offers</li>
                <li>VIP members earn +5 Stars per approved post</li>
                <li>Daily check-in rewards</li>
              </ul>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-bold mb-2">⭐ What are Stars?</h3>
              <p>Stars are the platform currency. You spend Stars to view premium content and earn Stars from your own content. Stars can be converted to real money in your wallet.</p>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-bold mb-2">💳 How We Pay</h3>
              <p>Your earnings accumulate in your Wallet. You can request a withdrawal to your bank account once you meet the minimum threshold. Payments are processed within 48 hours.</p>
            </div>

            <div className="bg-destructive/10 p-4 rounded-lg border border-destructive/20">
              <h3 className="font-bold mb-2">🚫 What NOT to Do</h3>
              <ul className="space-y-1 list-disc pl-4">
                <li>Don't post inappropriate or illegal content</li>
                <li>Don't spam or harass other users</li>
                <li>Don't create multiple accounts</li>
                <li>Don't share misleading information</li>
              </ul>
            </div>

            <Button className="w-full" onClick={() => setStep(3)}>
              Continue to Profile Setup <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 3: Profile edit
  if (step === 3) {
    return (
      <div className="min-h-screen bg-background p-4 overflow-y-auto pb-24">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5" /> Set Up Your Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Display Name</Label>
              <Input value={profileData.full_name} onChange={e => setProfileData(p => ({ ...p, full_name: e.target.value }))} placeholder="Your display name" />
            </div>
            <div>
              <Label>Bio</Label>
              <Textarea value={profileData.bio} onChange={e => setProfileData(p => ({ ...p, bio: e.target.value }))} placeholder="Tell people about yourself..." maxLength={200} />
            </div>
            <Button className="w-full" onClick={saveProfile}>
              Done <CheckCircle className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 4: Star Market intro
  if (step === 4) {
    return (
      <div className="min-h-screen bg-background p-4 overflow-y-auto pb-24">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-center">
              <Star className="w-5 h-5 text-yellow-500" /> Star Market
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Stars are the currency of SaveMore. Buy Stars to unlock premium content, boost your posts, and access exclusive features. You can also earn Stars from your content!
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => {
                // Mark onboarding complete then navigate to star market
                completeOnboarding();
              }}>
                Visit Star Market
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setStep(5)}>
                Skip
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 5: Create first content
  if (step === 5) {
    return (
      <div className="min-h-screen bg-background p-4 overflow-y-auto pb-24">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle className="text-center">🎉 Almost Done!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Create your first post or story to unlock all features and start earning!
            </p>
            <Button className="w-full" onClick={completeOnboarding}>
              Let's Go! <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function completeOnboarding() {
    if (!user) return;
    // Mark onboarding as done
    await supabase.from('user_profiles').update({
      story_settings: { onboarding_complete: true }
    }).eq('id', user.id);
    toast({ title: "Welcome! 🎉", description: "You're all set. Enjoy SaveMore!" });
    onComplete();
  }

  return null;
};

export default OnboardingFlow;
