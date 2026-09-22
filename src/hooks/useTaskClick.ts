import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface TaskClickResult {
  success: boolean;
  clickId?: string;
  error?: string;
}

/**
 * Record a task click event and get a click ID for postback matching.
 * Must be called BEFORE opening the provider offerwall/locker.
 *
 * Returns a click ID that provider postback should include to credit the user.
 */
export const useTaskClick = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const recordClick = async (
    providerId: string,
    offerId: string,
  ): Promise<TaskClickResult> => {
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    setLoading(true);
    try {
      // Get user's IP and device ID
      const deviceId = localStorage.getItem('device_id') || `device-${user.id.substring(0, 8)}`;
      
      // In a real app, you'd get the user's actual IP from an endpoint.
      // For now, we'll use a placeholder that the backend can update.
      const ipAddress = 'client-ip'; // Will be enriched by backend

      // Call the new RPC to record the click
      const { data, error } = await supabase.rpc('record_task_click_v2', {
        p_provider_id: providerId.toLowerCase(),
        p_offer_id: offerId,
        p_ip: ipAddress,
        p_device_id: deviceId,
      });

      if (error) {
        console.error('Error recording task click:', error);
        toast({
          title: 'Cannot start task',
          description: error.message || 'Please check your profile and try again',
          variant: 'destructive',
        });
        return { success: false, error: error.message };
      }

      const result = (data as any) || {};
      if (!result.success) {
        toast({
          title: 'Cannot start task',
          description: result.error || 'You may not be eligible for this task',
          variant: 'destructive',
        });
        return { success: false, error: result.error };
      }

      // Store the click ID for this offer so postback can match it
      const clickId = result.click_id;
      if (clickId) {
        sessionStorage.setItem(`offer-click-${offerId}`, clickId);
      }

      return { success: true, clickId };
    } catch (error: any) {
      console.error('Error recording click:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start task',
        variant: 'destructive',
      });
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  return { recordClick, loading };
};
