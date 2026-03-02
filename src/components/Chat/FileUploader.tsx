import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
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
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: 'File Too Large', description: 'Max file size is 500MB.', variant: 'destructive' });
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploading(true);
    setProgress(10);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      // Path: chat-files/userId/timestamp.ext — matches storage RLS policy
      const fileName = `chat-files/${user.id}/${Date.now()}.${ext}`;
      
      setProgress(30);

      const { error } = await supabase.storage.from('post-media').upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });

      setProgress(80);

      if (error) {
        console.error('Upload error:', error);
        toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
        setUploading(false);
        setProgress(0);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }

      const { data: urlData } = supabase.storage.from('post-media').getPublicUrl(fileName);
      
      const fileType = file.type.startsWith('image/') 
        ? 'image' 
        : file.type.startsWith('video/') 
          ? 'video' 
          : file.type.startsWith('audio/')
            ? 'audio'
            : 'document';
      
      setProgress(100);
      onFileUploaded(urlData.publicUrl, fileType);
      toast({ title: 'File Sent', description: `${file.name} uploaded successfully` });
    } catch (err: any) {
      console.error('File upload error:', err);
      toast({ title: 'Upload Error', description: err.message || 'Failed to upload file', variant: 'destructive' });
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="shrink-0">
      <input 
        ref={inputRef} 
        type="file" 
        className="hidden" 
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar,.xls,.xlsx,.ppt,.pptx,.csv" 
        onChange={handleFileSelect} 
      />
      {uploading ? (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" disabled className="h-8 w-8">
            <Loader2 className="w-4 h-4 animate-spin" />
          </Button>
          {progress > 0 && progress < 100 && (
            <Progress value={progress} className="w-12 h-1" />
          )}
        </div>
      ) : (
        <Button variant="ghost" size="icon" onClick={() => inputRef.current?.click()} className="h-8 w-8">
          <Paperclip className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
};
