import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface VoiceRecorderProps {
  onVoiceSent: (url: string) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onVoiceSent }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    if (!user) return;

    // Check voice credits via RPC for proper star deduction
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('voice_credits, star_balance')
        .eq('id', user.id)
        .single();

      const credits = profile?.voice_credits ?? 10;
      if (credits <= 0) {
        const stars = profile?.star_balance ?? 0;
        if (stars < 20) {
          toast({ title: 'No Voice Credits', description: 'You need 20 Stars to get 10 more recordings.', variant: 'destructive' });
          return;
        }
        // Use RPC for safe star deduction
        const { data, error } = await supabase.rpc('deduct_voice_credits', { p_user_id: user.id });
        if (error) {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
          return;
        }
        const result = data as any;
        if (result?.success === false) {
          toast({ title: 'Error', description: result.error || 'Could not recharge voice credits', variant: 'destructive' });
          return;
        }
        toast({ title: 'Voice Credits Recharged', description: '20 Stars deducted. 10 recordings added!' });
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await uploadVoice(blob);
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err: any) {
      toast({ title: 'Mic Error', description: err.message || 'Could not access microphone.', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const uploadVoice = async (blob: Blob) => {
    if (!user) return;
    setUploading(true);
    try {
      const fileName = `voice/${user.id}/${Date.now()}.webm`;
      const { error } = await supabase.storage.from('post-media').upload(fileName, blob, { contentType: 'audio/webm' });

      if (error) {
        toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('post-media').getPublicUrl(fileName);

      // Deduct voice credit via RPC
      await supabase.rpc('deduct_voice_credits', { p_user_id: user.id });

      onVoiceSent(urlData.publicUrl);
    } catch (err: any) {
      toast({ title: 'Upload Error', description: err.message || 'Failed to upload voice', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {recording ? (
        <Button variant="destructive" size="icon" onClick={stopRecording} className="shrink-0">
          <Square className="w-4 h-4" />
        </Button>
      ) : uploading ? (
        <Button variant="ghost" size="icon" disabled className="shrink-0">
          <Loader2 className="w-4 h-4 animate-spin" />
        </Button>
      ) : (
        <Button variant="ghost" size="icon" onClick={startRecording} className="shrink-0">
          <Mic className="w-4 h-4" />
        </Button>
      )}
    </>
  );
};
