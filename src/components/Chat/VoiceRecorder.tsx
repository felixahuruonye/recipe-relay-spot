import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  const [recordingTime, setRecordingTime] = useState(0);
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    if (!user) return;

    try {
      // Check voice credits
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('voice_credits, star_balance')
        .eq('id', user.id)
        .single();

      let credits = profile?.voice_credits ?? 10;
      
      if (credits <= 0) {
        const stars = profile?.star_balance ?? 0;
        if (stars < 20) {
          toast({ 
            title: 'No Voice Credits', 
            description: 'You need 20 Stars to get 10 more recordings. Buy Stars to continue.', 
            variant: 'destructive' 
          });
          return;
        }
        // Use RPC to recharge (bypasses profile protection trigger)
        const { data: newCredits, error: rpcError } = await supabase.rpc('deduct_voice_credits', { 
          p_user_id: user.id, 
          p_recharge: true 
        });

        if (rpcError || newCredits === -1) {
          toast({ title: 'Error', description: 'Could not recharge voice credits', variant: 'destructive' });
          return;
        }

        credits = newCredits as number;
        toast({ title: 'Voice Credits Recharged! 🎤', description: '20 Stars deducted. 10 recordings added!' });
      }

      setCreditsLeft(credits);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Try opus first, fall back to default
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = '';
        }
      }

      const mediaRecorder = mimeType 
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setRecordingTime(0);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        if (blob.size > 0) {
          await uploadVoice(blob);
        }
      };

      mediaRecorder.start(250);
      setRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error('Mic error:', err);
      toast({ title: 'Microphone Error', description: 'Could not access microphone. Please allow microphone access.', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const uploadVoice = async (blob: Blob) => {
    if (!user) return;
    setUploading(true);
    try {
      // Path must be userId/filename for storage RLS, OR voice/userId/filename with new policy
      const fileName = `voice/${user.id}/${Date.now()}.webm`;
      const { error } = await supabase.storage.from('post-media').upload(fileName, blob, { 
        contentType: 'audio/webm',
        cacheControl: '3600',
      });

      if (error) {
        console.error('Voice upload error:', error);
        toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('post-media').getPublicUrl(fileName);

      // Use RPC to deduct 1 credit (bypasses profile protection trigger)
      const { data: newCredits } = await supabase.rpc('deduct_voice_credits', { 
        p_user_id: user.id, 
        p_recharge: false 
      });

      const remaining = (newCredits as number) ?? 0;
      setCreditsLeft(remaining);
      onVoiceSent(urlData.publicUrl);
      
      if (remaining <= 2 && remaining > 0) {
        toast({ title: `${remaining} recordings left`, description: 'Voice credits running low!' });
      } else if (remaining === 0) {
        toast({ title: 'No recordings left', description: 'Next recording will cost 20 Stars.' });
      }
    } catch (err: any) {
      toast({ title: 'Upload Error', description: err.message || 'Failed to upload voice', variant: 'destructive' });
    } finally {
      setUploading(false);
      setRecordingTime(0);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-1 shrink-0">
      {recording ? (
        <div className="flex items-center gap-1">
          <Badge variant="destructive" className="text-xs animate-pulse">
            🔴 {formatTime(recordingTime)}
          </Badge>
          {creditsLeft !== null && (
            <span className="text-[10px] text-muted-foreground">{creditsLeft} left</span>
          )}
          <Button variant="destructive" size="icon" onClick={stopRecording} className="h-8 w-8">
            <Square className="w-3 h-3" />
          </Button>
        </div>
      ) : uploading ? (
        <Button variant="ghost" size="icon" disabled className="h-8 w-8">
          <Loader2 className="w-4 h-4 animate-spin" />
        </Button>
      ) : (
        <Button variant="ghost" size="icon" onClick={startRecording} className="h-8 w-8" title={creditsLeft !== null ? `${creditsLeft} recordings left` : 'Record voice'}>
          <Mic className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
};
