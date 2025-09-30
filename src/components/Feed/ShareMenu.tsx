import { useState } from 'react';
import { Share2, Copy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ShareMenuProps {
  postId: string;
  postTitle: string;
}

export const ShareMenu = ({ postId, postTitle }: ShareMenuProps) => {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  const postUrl = `${window.location.origin}/post/${postId}`;

  const shareToStoryline = async () => {
    if (!user) return;

    // Create storyline entry
    const { error } = await supabase.from('user_storylines').insert({
      user_id: user.id,
      media_url: postUrl,
    });

    if (error) {
      toast({ title: 'Error', description: 'Failed to share to storyline', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Shared to your storyline' });
      setOpen(false);
    }
  };

  const shareToSocial = (platform: string) => {
    const urls: { [key: string]: string } = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(postTitle)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(postTitle + ' ' + postUrl)}`,
      instagram: 'https://www.instagram.com/',
      tiktok: 'https://www.tiktok.com/',
    };

    window.open(urls[platform], '_blank', 'width=600,height=400');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(postUrl);
    toast({ title: 'Success', description: 'Link copied to clipboard' });
  };

  const fetchGroups = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('group_members')
      .select('group_id, groups(id, name)')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (data) {
      setGroups(data.map((item: any) => item.groups).filter(Boolean));
    }
  };

  const shareToGroup = async (groupId: string) => {
    if (!user) return;

    // Create a message in the group with the post link
    const { error } = await supabase.from('messages').insert({
      from_user_id: user.id,
      channel: groupId,
      body: `Check out this post: ${postTitle}`,
      media_url: postUrl,
    });

    if (error) {
      toast({ title: 'Error', description: 'Failed to share to group', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Shared to group' });
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" onClick={fetchGroups}>
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Post</DialogTitle>
          <DialogDescription>Choose how you want to share this post</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start" onClick={shareToStoryline}>
            <div className="w-8 h-8 rounded-full bg-blue-500 mr-3" />
            Share to Storyline
          </Button>

          <div className="border-t pt-2">
            <p className="text-sm text-muted-foreground mb-2">Share to social media</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => shareToSocial('facebook')}>
                Facebook
              </Button>
              <Button variant="outline" onClick={() => shareToSocial('twitter')}>
                X (Twitter)
              </Button>
              <Button variant="outline" onClick={() => shareToSocial('whatsapp')}>
                WhatsApp
              </Button>
              <Button variant="outline" onClick={() => shareToSocial('instagram')}>
                Instagram
              </Button>
              <Button variant="outline" onClick={() => shareToSocial('tiktok')}>
                TikTok
              </Button>
            </div>
          </div>

          <div className="border-t pt-2">
            <p className="text-sm text-muted-foreground mb-2">Copy link</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={postUrl}
                readOnly
                className="flex-1 px-3 py-2 text-sm border rounded-md bg-muted"
              />
              <Button size="icon" onClick={copyLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {groups.length > 0 && (
            <div className="border-t pt-2">
              <p className="text-sm text-muted-foreground mb-2">Share to group</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {groups.map((group) => (
                  <Button
                    key={group.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => shareToGroup(group.id)}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    {group.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
