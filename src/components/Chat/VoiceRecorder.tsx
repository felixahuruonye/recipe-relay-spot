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

    // Check voice credits
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
      await supabase.from('user_profiles').update({
        star_balance: stars - 20,
        voice_credits: 10,
      }).eq('id', user.id);
      toast({ title: 'Voice Credits Recharged', description: '20 Stars deducted. 10 recordings added!' });
    }

    try {
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
    } catch {
      toast({ title: 'Mic Error', description: 'Could not access microphone.', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const uploadVoice = async (blob: Blob) => {
    if (!user) return;
    setUploading(true);
    const fileName = `voice/${user.id}/${Date.now()}.webm`;
    const { error } = await supabase.storage.from('post-media').upload(fileName, blob, { contentType: 'audio/webm' });

    if (error) {
      toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('post-media').getPublicUrl(fileName);

    // Deduct voice credit
    const { data: currentProfile } = await supabase
      .from('user_profiles')
      .select('voice_credits')
      .eq('id', user.id)
      .single();

    if (currentProfile) {
      await supabase.from('user_profiles').update({
        voice_credits: Math.max(0, (currentProfile.voice_credits ?? 10) - 1)
      }).eq('id', user.id);
    }

    onVoiceSent(urlData.publicUrl);
    setUploading(false);
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
