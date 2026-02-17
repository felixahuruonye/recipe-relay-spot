import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface FileUploaderProps {
  onFileUploaded: (url: string, type: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileUploaded }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Allow up to 500MB
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: 'File Too Large', description: 'Max file size is 500MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `chat-files/${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('post-media').upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

      if (error) {
        toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('post-media').getPublicUrl(fileName);
      const fileType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document';
      onFileUploaded(urlData.publicUrl, fileType);
    } catch (err: any) {
      toast({ title: 'Upload Error', description: err.message || 'Failed to upload file', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" className="hidden" accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.rar" onChange={handleFileSelect} />
      {uploading ? (
        <Button variant="ghost" size="icon" disabled className="shrink-0">
          <Loader2 className="w-4 h-4 animate-spin" />
        </Button>
      ) : (
        <Button variant="ghost" size="icon" onClick={() => inputRef.current?.click()} className="shrink-0">
          <Paperclip className="w-4 h-4" />
        </Button>
      )}
    </>
  );
};
