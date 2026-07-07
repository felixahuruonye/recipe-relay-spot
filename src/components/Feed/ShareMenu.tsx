import { useState, useEffect } from 'react';
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
  postImage?: string;
  postDescription?: string;
  postMediaType?: string;
}

export const ShareMenu = ({ postId, postTitle, postImage, postDescription, postMediaType }: ShareMenuProps) => {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  const baseUrl = window.location.origin;
  const postUrl = `${baseUrl}/feed?post=${postId}`;
  // /p/:id is a dedicated share link: social-media crawlers get real OG preview
  // tags (via the api/share-post Edge Function), while real users get redirected
  // straight into the app.
  const shareLinkUrl = `${baseUrl}/p/${postId}`;

  // Create a share message with thumbnail info
  const shareText = `🔥 ${postTitle}\n\n${postDescription?.slice(0, 100) || ''}\n\n📱 Lenory Social`;
  const fullShareUrl = shareLinkUrl;

  // Update document meta tags when sharing
  useEffect(() => {
    if (open && postImage) {
      // These won't work for WhatsApp preview (needs server-side), but helps with browser share
      updateMetaTags();
    }
  }, [open, postImage, postTitle]);

  const updateMetaTags = () => {
    // Update OG tags dynamically (limited effectiveness for some platforms)
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');

    if (ogTitle) ogTitle.setAttribute('content', postTitle);
    if (ogDescription) ogDescription.setAttribute('content', postDescription || 'Check out this post on Lenory Social!');
    if (ogImage && postImage) ogImage.setAttribute('content', postImage);
    if (ogUrl) ogUrl.setAttribute('content', postUrl);
  };

  const isVideoMedia = (url?: string) => {
    if (postMediaType) return postMediaType === 'video';
    return !!url && (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url) || url.includes('video'));
  };

  // Generate a real thumbnail from a *remote* video URL (the video is already
  // uploaded/hosted - we just need a still frame to use as the storyline
  // preview image, since <img> tags can't render a video file).
  const generateThumbnailFromUrl = (url: string): Promise<Blob | null> => new Promise(resolve => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    const cleanup = () => resolve(null);
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.35, Math.max(0, (video.duration || 1) - 0.1));
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.82);
      } catch {
        // CORS-tainted canvas or decode failure - fall back to no thumbnail
        cleanup();
      }
    };
    video.onerror = cleanup;
    setTimeout(cleanup, 6000); // don't hang forever on a slow/broken stream
  });

  const shareToStoryline = async () => {
    if (!user || !postImage) return;
    const isVideo = isVideoMedia(postImage);

    let previewUrl = postImage; // images use the media itself as the preview
    if (isVideo) {
      const thumbBlob = await generateThumbnailFromUrl(postImage);
      if (thumbBlob) {
        const fileName = `${user.id}/stories/preview-${Date.now()}.jpg`;
        const { error: uploadErr } = await supabase.storage.from('post-media').upload(fileName, thumbBlob);
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from('post-media').getPublicUrl(fileName);
          previewUrl = publicUrl;
        }
      }
      // If thumbnail generation failed (e.g. CORS), fall back to the user's own
      // avatar rather than leaving a broken image - never leave preview_url
      // pointing at a video file, since <img> tags can't render that.
      if (previewUrl === postImage) {
        const { data: profile } = await supabase.from('user_profiles').select('avatar_url').eq('id', user.id).maybeSingle();
        previewUrl = profile?.avatar_url || previewUrl;
      }
    }

    const { error } = await supabase.from('user_storylines').insert({
      user_id: user.id,
      media_url: postImage,
      preview_url: previewUrl,
      caption: postTitle,
      media_type: isVideo ? 'video' : 'image',
    } as any);

    if (error) {
      toast({ title: 'Error', description: 'Failed to share to storyline', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Shared to your storyline' });
      setOpen(false);
    }
  };

  const shareToSocial = (platform: string) => {
    const imageParam = postImage ? `&image=${encodeURIComponent(postImage)}` : '';
    
    const urls: { [key: string]: string } = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullShareUrl)}&quote=${encodeURIComponent(shareText)}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(fullShareUrl)}&text=${encodeURIComponent(shareText)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText + '\n\n' + fullShareUrl)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(fullShareUrl)}&text=${encodeURIComponent(shareText)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(fullShareUrl)}`,
    };

    window.open(urls[platform], '_blank', 'width=600,height=400');
    
    // Track share
    if (user) {
      supabase.from('post_shares').insert({
        post_id: postId,
        user_id: user.id,
        share_type: platform
      }).then(() => {});
    }
  };

  const copyLink = async () => {
    try {
      // Copy with formatted text for better sharing
      const copyText = `${shareText}\n\n${fullShareUrl}`;
      await navigator.clipboard.writeText(copyText);
      toast({ title: 'Copied!', description: 'Link and preview info copied to clipboard' });
    } catch {
      // Fallback
      navigator.clipboard.writeText(fullShareUrl);
      toast({ title: 'Copied!', description: 'Link copied to clipboard' });
    }
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: postTitle,
          text: postDescription || 'Check out this post on Lenory Social!',
          url: fullShareUrl,
        });
        toast({ title: 'Shared!', description: 'Post shared successfully' });
      } catch (err) {
        // User cancelled or error
      }
    }
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

    const { error } = await supabase.from('group_messages').insert({
      group_id: groupId,
      user_id: user.id,
      message: `📢 Shared: ${postTitle}\n\n${fullShareUrl}`,
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
        
        {/* Preview Card */}
        {postImage && (
          <div className="border rounded-lg p-3 bg-muted/50">
            <div className="flex gap-3">
              <img src={postImage} alt="" className="w-16 h-16 object-cover rounded" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm line-clamp-2">{postTitle}</p>
                <p className="text-xs text-muted-foreground">Lenory Social</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {/* Native Share (if available) */}
          {typeof navigator.share === 'function' && (
            <Button variant="outline" className="w-full justify-start" onClick={nativeShare}>
              <Share2 className="w-5 h-5 mr-3" />
              Share via...
            </Button>
          )}

          {postImage && (
            <Button variant="outline" className="w-full justify-start" onClick={shareToStoryline}>
              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 mr-3" />
              Share to Storyline
            </Button>
          )}

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
              <Button variant="outline" onClick={() => shareToSocial('telegram')}>
                Telegram
              </Button>
            </div>
          </div>

          <div className="border-t pt-2">
            <p className="text-sm text-muted-foreground mb-2">Copy link</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={fullShareUrl}
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