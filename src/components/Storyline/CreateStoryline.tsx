import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Upload } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface CreateStorylineProps {
  onCreated?: () => void;
}

export const CreateStoryline: React.FC<CreateStorylineProps> = ({ onCreated }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>('');
  const [caption, setCaption] = useState('');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewPreview, setPreviewPreview] = useState<string>('');
  const [musicFile, setMusicFile] = useState<File | null>(null);

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = file.type.startsWith('video/') ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: 'File too large',
        description: `File must be less than ${file.type.startsWith('video/') ? '100MB' : '10MB'}`,
        variant: 'destructive'
      });
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handlePreviewChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Preview image must be less than 5MB',
        variant: 'destructive'
      });
      return;
    }

    setPreviewFile(file);
    setPreviewPreview(URL.createObjectURL(file));
  };

  const handleMusicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Music file must be less than 10MB',
        variant: 'destructive'
      });
      return;
    }

    setMusicFile(file);
  };

  const handleSubmit = async () => {
    if (!user || !mediaFile) return;

    setLoading(true);
    try {
      // Upload media
      const fileExt = mediaFile.name.split('.').pop();
      const fileName = `${user.id}/stories/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('post-media')
        .upload(fileName, mediaFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('post-media')
        .getPublicUrl(fileName);

      // Upload preview if provided
      let previewUrl = null;
      if (previewFile) {
        const previewExt = previewFile.name.split('.').pop();
        const previewFileName = `${user.id}/stories/preview-${Date.now()}.${previewExt}`;

        const { error: previewError } = await supabase.storage
          .from('post-media')
          .upload(previewFileName, previewFile);

        if (!previewError) {
          const { data: { publicUrl: previewPublicUrl } } = supabase.storage
            .from('post-media')
            .getPublicUrl(previewFileName);
          previewUrl = previewPublicUrl;
        }
      }

      // Upload music if provided
      let musicUrl = null;
      if (musicFile) {
        const musicExt = musicFile.name.split('.').pop();
        const musicFileName = `${user.id}/stories/music-${Date.now()}.${musicExt}`;

        const { error: musicError } = await supabase.storage
          .from('post-media')
          .upload(musicFileName, musicFile);

        if (!musicError) {
          const { data: { publicUrl: musicPublicUrl } } = supabase.storage
            .from('post-media')
            .getPublicUrl(musicFileName);
          musicUrl = musicPublicUrl;
        }
      }

      // Create storyline
      const { error: insertError } = await supabase
        .from('user_storylines')
        .insert({
          user_id: user.id,
          media_url: publicUrl,
          preview_url: previewUrl || publicUrl,
          music_url: musicUrl,
          media_type: mediaFile.type.startsWith('video/') ? 'video' : 'image'
        });

      if (insertError) throw insertError;

      toast({ title: 'Success', description: 'Story created!' });
      setOpen(false);
      setMediaFile(null);
      setMediaPreview('');
      setCaption('');
      setPreviewFile(null);
      setPreviewPreview('');
      setMusicFile(null);
      if (onCreated) onCreated();
    } catch (error) {
      console.error('Error creating story:', error);
      toast({ title: 'Error', description: 'Failed to create story', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Story</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Media Upload */}
            <div>
              <Input
                type="file"
                accept="image/*,video/*"
                onChange={handleMediaChange}
                className="hidden"
                id="story-media"
              />
              <label htmlFor="story-media">
                <Button variant="outline" className="w-full" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Photo/Video
                  </span>
                </Button>
              </label>

              {mediaPreview && (
                <div className="mt-4">
                  {mediaFile?.type.startsWith('video/') ? (
                    <video src={mediaPreview} controls className="w-full rounded-lg max-h-60" />
                  ) : (
                    <img src={mediaPreview} alt="Preview" className="w-full rounded-lg max-h-60 object-cover" />
                  )}
                </div>
              )}
            </div>

            {/* Preview Image */}
            <div>
              <label className="text-sm font-medium">Story Preview (Optional)</label>
              <Input
                type="file"
                accept="image/*"
                onChange={handlePreviewChange}
                className="hidden"
                id="preview-upload"
              />
              <label htmlFor="preview-upload">
                <Button variant="outline" className="w-full" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    {previewFile ? 'Preview Selected' : 'Set Preview Image'}
                  </span>
                </Button>
              </label>
              {previewPreview && (
                <img src={previewPreview} alt="Preview" className="mt-2 w-full h-20 object-cover rounded" />
              )}
            </div>

            {/* Music */}
            <div>
              <label className="text-sm font-medium">Add Music (Optional)</label>
              <Input
                type="file"
                accept="audio/*"
                onChange={handleMusicChange}
                className="hidden"
                id="music-upload"
              />
              <label htmlFor="music-upload">
                <Button variant="outline" className="w-full" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    {musicFile ? musicFile.name : 'Choose Music'}
                  </span>
                </Button>
              </label>
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={!mediaFile || loading}
              className="w-full"
            >
              {loading ? 'Creating...' : 'Share Story'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
