import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface EligibilityStatus {
  isReady: boolean;
  isLoading: boolean;
  errors: string[];
  dateOfBirth: string | null;
  deviceTracked: boolean;
  deviceId: string | null;
  countryCode: string | null;
  isRestricted: boolean;
  restrictionReason: string | null;
  deviceTrackingConsented: boolean;
  ageLocked: boolean;
  ageLockExpiresAt: string | null;
}

/**
 * Check if user can access the task/earnings page.
 * Returns required fields and any missing items that gate access.
 */
export const useTaskEligibility = (): EligibilityStatus => {
  const { user } = useAuth();
  const [status, setStatus] = useState<EligibilityStatus>({
    isReady: false,
    isLoading: true,
    errors: [],
    dateOfBirth: null,
    deviceTracked: false,
    deviceId: null,
    countryCode: null,
    isRestricted: false,
    restrictionReason: null,
    deviceTrackingConsented: false,
    ageLocked: false,
    ageLockExpiresAt: null,
  });

  useEffect(() => {
    if (!user) {
      setStatus((prev) => ({ ...prev, isLoading: false, isReady: false }));
      return;
    }

    loadEligibilityStatus();
  }, [user?.id]);

  const loadEligibilityStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('date_of_birth, country_code, device_tracking_consented, earning_restricted, earning_restricted_reason, age_locked_at')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      const errors: string[] = [];
      const dateOfBirth = data?.date_of_birth || null;
      const countryCode = data?.country_code || null;
      const deviceTrackingConsented = data?.device_tracking_consented || false;
      const isRestricted = data?.earning_restricted || false;
      const restrictionReason = data?.earning_restricted_reason || null;
      const ageLocked = !!data?.age_locked_at;
      const ageLockExpiresAt = data?.age_locked_at || null;

      // Eligibility checks
      if (!dateOfBirth) {
        errors.push('Date of birth required');
      }
      if (!countryCode) {
        errors.push('Country information required');
      }
      if (!deviceTrackingConsented) {
        errors.push('Device registration required');
      }
      if (isRestricted) {
        errors.push(`Account restricted: ${restrictionReason || 'contact support'}`);
      }

      // Get device tracking status if consented
      let deviceTracked = false;
      let deviceId = null;
      if (deviceTrackingConsented) {
        const storedDeviceId = localStorage.getItem('device_id');
        if (storedDeviceId) {
          deviceId = storedDeviceId;
          deviceTracked = true;
        }
      }

      setStatus({
        isReady: errors.length === 0,
        isLoading: false,
        errors,
        dateOfBirth,
        deviceTracked,
        deviceId,
        countryCode,
        isRestricted,
        restrictionReason,
        deviceTrackingConsented,
        ageLocked,
        ageLockExpiresAt,
      });
    } catch (error) {
      console.error('Error loading task eligibility:', error);
      setStatus((prev) => ({
        ...prev,
        isLoading: false,
        isReady: false,
        errors: ['Failed to load eligibility status'],
      }));
    }
  };

  return status;
};
