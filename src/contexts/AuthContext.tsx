import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, userData?: any) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Activity-based online detection
const useActivityTracker = (userId: string | undefined) => {
  const lastActivityRef = useRef<number>(Date.now());
  const isActiveRef = useRef(true);

  useEffect(() => {
    if (!userId) return;

    const markActive = () => {
      lastActivityRef.current = Date.now();
      if (!isActiveRef.current) {
        isActiveRef.current = true;
        supabase
          .from('user_profiles')
          .update({ is_online: true, last_seen: new Date().toISOString() })
          .eq('id', userId)
          .then();
      }
    };

    // Listen for actual user activity
    const events = ['click', 'keydown', 'scroll', 'touchstart', 'mousemove', 'focus'];
    events.forEach(e => window.addEventListener(e, markActive, { passive: true }));

    // Check every 30 seconds if user is still active
    const checkInterval = setInterval(() => {
      const inactiveDuration = Date.now() - lastActivityRef.current;
      if (inactiveDuration > 90000) {
        // Inactive for 90 seconds - mark offline
        if (isActiveRef.current) {
          isActiveRef.current = false;
          supabase
            .from('user_profiles')
            .update({ is_online: false, last_seen: new Date().toISOString() })
            .eq('id', userId)
            .then();
        }
      } else {
        // Active - update heartbeat
        supabase
          .from('user_profiles')
          .update({ is_online: true, last_seen: new Date().toISOString() })
          .eq('id', userId)
          .then();
      }
    }, 30000);

    // Initial mark as online
    supabase
      .from('user_profiles')
      .update({ is_online: true, last_seen: new Date().toISOString() })
      .eq('id', userId)
      .then();

    return () => {
      events.forEach(e => window.removeEventListener(e, markActive));
      clearInterval(checkInterval);
    };
  }, [userId]);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Track user activity for online status
  useActivityTracker(user?.id);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Set offline on page unload
    const handleBeforeUnload = () => {
      const currentUser = supabase.auth.getUser();
      // Use synchronous approach for unload
      const userId = user?.id;
      if (userId) {
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL || ''}/rest/v1/user_profiles?id=eq.${userId}`,
          ''
        );
        // Fallback
        supabase
          .from('user_profiles')
          .update({ is_online: false, last_seen: new Date().toISOString() })
          .eq('id', userId)
          .then();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && user?.id) {
        // Don't immediately set offline - just update last_seen
        supabase
          .from('user_profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', user.id)
          .then();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const signUp = async (email: string, password: string, userData?: any) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectUrl, data: userData }
    });
    if (error) toast({ title: "Sign Up Error", description: error.message, variant: "destructive" });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast({ title: "Sign In Error", description: error.message, variant: "destructive" });
    return { error };
  };

  const signOut = async () => {
    if (user) {
      await supabase.from('user_profiles').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', user.id);
    }
    const { error } = await supabase.auth.signOut();
    if (error) toast({ title: "Sign Out Error", description: error.message, variant: "destructive" });
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Password Reset Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password Reset Email Sent", description: "Please check your email for a link to reset your password." });
    }
    return { error };
  };

  const value = { user, session, loading, signUp, signIn, signOut, resetPassword };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};