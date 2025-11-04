import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useVoiceSearch = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(async () => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to use voice search',
        variant: 'destructive'
      });
      return;
    }

    // Check and manage AI credits
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('ai_credits, star_balance')
      .eq('id', user.id)
      .single();

    let aiCredits = profile?.ai_credits || 0;
    let starBalance = profile?.star_balance || 0;

    // Voice search costs 50 credits
    if (aiCredits < 50) {
      if (starBalance >= 300) {
        aiCredits = 50;
        starBalance -= 300;
        
        await supabase
          .from('user_profiles')
          .update({ ai_credits: aiCredits, star_balance: starBalance })
          .eq('id', user.id);
          
        toast({
          title: 'Credits Recharged',
          description: '50 AI credits added (300 Stars deducted)',
        });
      } else {
        toast({
          title: 'Insufficient Credits',
          description: 'You need 300 Stars to recharge voice search credits',
          variant: 'destructive'
        });
        return;
      }
    }

    // Check for Web Speech API support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: 'Not Supported',
        description: 'Voice search is not supported in this browser',
        variant: 'destructive'
      });
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
      setIsListening(true);
    };

    recognitionRef.current.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join('');
      
      setTranscript(transcript);
    };

    recognitionRef.current.onend = async () => {
      setIsListening(false);
      
      // Deduct 50 credits
      await supabase
        .from('user_profiles')
        .update({ ai_credits: aiCredits - 50 })
        .eq('id', user.id);
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      toast({
        title: 'Error',
        description: 'Failed to recognize speech. Please try again.',
        variant: 'destructive'
      });
    };

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      setIsListening(false);
    }
  }, [user, toast]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    resetTranscript
  };
};
