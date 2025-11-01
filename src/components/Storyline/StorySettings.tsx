import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface StorySettingsProps {
  onSettingsChange?: (settings: any) => void;
}

export const StorySettings: React.FC<StorySettingsProps> = ({ onSettingsChange }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  
  // Privacy settings
  const [showToEveryone, setShowToEveryone] = useState(true);
  const [showToFollowers, setShowToFollowers] = useState(false);
  const [showOnlyMe, setShowOnlyMe] = useState(false);
  
  // Story privacy
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  
  // Audience control
  const [audienceControlEnabled, setAudienceControlEnabled] = useState(false);
  const [minAge, setMinAge] = useState(13);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('user_profiles')
      .select('story_settings')
      .eq('id', user.id)
      .single();
    
    if (data?.story_settings && typeof data.story_settings === 'object' && !Array.isArray(data.story_settings)) {
      const settings = data.story_settings as any;
      setShowToEveryone(settings.show_to_everyone ?? true);
      setShowToFollowers(settings.show_to_followers ?? false);
      setShowOnlyMe(settings.show_only_me ?? false);
      setCommentsEnabled(settings.comments_enabled ?? true);
      setAudienceControlEnabled(settings.audience_control ?? false);
      setMinAge(settings.min_age ?? 13);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    // Ensure only one visibility option is active
    let visibilitySettings = {
      show_to_everyone: showToEveryone,
      show_to_followers: showToFollowers,
      show_only_me: showOnlyMe
    };

    const settings = {
      ...visibilitySettings,
      comments_enabled: commentsEnabled,
      audience_control: audienceControlEnabled,
      min_age: minAge
    };

    const { error } = await supabase
      .from('user_profiles')
      .update({ story_settings: settings })
      .eq('id', user.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Story settings updated!' });
      if (onSettingsChange) onSettingsChange(settings);
      setOpen(false);
    }
  };

  const handleVisibilityToggle = (type: 'everyone' | 'followers' | 'onlyme') => {
    // Turn off all, then turn on selected
    setShowToEveryone(type === 'everyone');
    setShowToFollowers(type === 'followers');
    setShowOnlyMe(type === 'onlyme');
  };

  return (
    <>
      <Button 
        variant="outline" 
        size="icon" 
        onClick={() => setOpen(true)}
        className="btn-3d"
      >
        <Settings className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto glass-card">
          <DialogHeader>
            <DialogTitle className="gradient-text">Story Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Visibility Settings */}
            <div className="space-y-3">
              <h3 className="font-semibold">Who can view your story</h3>
              <p className="text-xs text-muted-foreground">
                Choose who can see your stories. Only one option can be active at a time.
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between glass-card p-3 rounded-lg">
                  <Label htmlFor="everyone">Everyone</Label>
                  <Switch
                    id="everyone"
                    checked={showToEveryone}
                    onCheckedChange={() => handleVisibilityToggle('everyone')}
                  />
                </div>
                
                <div className="flex items-center justify-between glass-card p-3 rounded-lg">
                  <Label htmlFor="followers">Followers Only</Label>
                  <Switch
                    id="followers"
                    checked={showToFollowers}
                    onCheckedChange={() => handleVisibilityToggle('followers')}
                  />
                </div>
                
                <div className="flex items-center justify-between glass-card p-3 rounded-lg">
                  <Label htmlFor="onlyme">Only Me</Label>
                  <Switch
                    id="onlyme"
                    checked={showOnlyMe}
                    onCheckedChange={() => handleVisibilityToggle('onlyme')}
                  />
                </div>
              </div>
            </div>

            {/* Story Privacy */}
            <div className="space-y-3">
              <h3 className="font-semibold">Story Privacy 🔏</h3>
              
              <div className="flex items-center justify-between glass-card p-3 rounded-lg">
                <div>
                  <Label htmlFor="comments">Comments</Label>
                  <p className="text-xs text-muted-foreground">Allow viewers to comment privately</p>
                </div>
                <Switch
                  id="comments"
                  checked={commentsEnabled}
                  onCheckedChange={setCommentsEnabled}
                />
              </div>
            </div>

            {/* Audience Control */}
            <div className="space-y-3">
              <h3 className="font-semibold">Advance Control 🛂</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between glass-card p-3 rounded-lg">
                  <div>
                    <Label htmlFor="age-control">Audience Age Control</Label>
                    <p className="text-xs text-muted-foreground">Restrict viewing by minimum age</p>
                  </div>
                  <Switch
                    id="age-control"
                    checked={audienceControlEnabled}
                    onCheckedChange={setAudienceControlEnabled}
                  />
                </div>

                {audienceControlEnabled && (
                  <div className="glass-card p-3 rounded-lg">
                    <Label htmlFor="min-age">Minimum Age Required</Label>
                    <Input
                      id="min-age"
                      type="number"
                      min="13"
                      max="100"
                      value={minAge}
                      onChange={(e) => setMinAge(parseInt(e.target.value) || 13)}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Viewers must be at least {minAge} years old to view your stories
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Save Button */}
            <Button onClick={handleSave} className="w-full btn-3d">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
