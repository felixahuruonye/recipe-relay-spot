import React, { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "./components/Layout/AppLayout";
import Auth from "./pages/Auth";
import Chat from "./pages/Chat";
import Groups from "./pages/Groups";
import Marketplace from "./pages/Marketplace";
import ContactAdmin from "./pages/ContactAdmin";
import SharePlatform from "./pages/SharePlatform";
import { WalletBalance } from "./components/Wallet/WalletBalance";
import Explore from "./pages/Explore";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import StarMarketplace from "./pages/StarMarketplace";
import VIPSubscription from "./pages/VIPSubscription";
import SavedSearches from "./pages/SavedSearches";
import TikTokFeed from "./components/Feed/TikTokFeed";
import MusicianDashboard from "./pages/MusicianDashboard";
import Storyline from "./pages/Storyline";
import WalletPage from "./pages/WalletPage";
import ChatHub from "./pages/ChatHub";
import Welcome from "./pages/Welcome";
import GlobalSettings from "./pages/ChatSettings/GlobalSettings";
import MessageRequests from "./pages/ChatSettings/MessageRequests";
import GlobalPrivacy from "./pages/ChatSettings/GlobalPrivacy";
import MessageDelivery from "./pages/ChatSettings/MessageDelivery";
import DeliveryTarget from "./pages/ChatSettings/DeliveryTarget";
import BlockedAccounts from "./pages/ChatSettings/BlockedAccounts";
import ChatProfile from "./pages/ChatSettings/ChatProfile";
import ChatPrivacy from "./pages/ChatSettings/ChatPrivacy";
import DisappearingMessages from "./pages/ChatSettings/DisappearingMessages";

export const REFERRAL_STORAGE_KEY = 'lenory_ref_code';

// Captures ?ref=CODE from the URL (e.g. from the /r/:code referral link)
// into localStorage, so it survives all the way through to signup even if
// the user browses around a bit first before creating an account.
const ReferralCapture = () => {
  const location = useLocation();
  useEffect(() => {
    const ref = new URLSearchParams(location.search).get('ref');
    if (ref) localStorage.setItem(REFERRAL_STORAGE_KEY, ref);
  }, [location.search]);
  return null;
};

// Sends a freshly-logged-in user who hasn't completed onboarding to the
// welcome/follow-gate flow, from anywhere in the app.
const OnboardingGate = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    supabase.from('user_profiles').select('onboarding_completed').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setChecked(true);
        const onWelcome = location.pathname === '/welcome';
        if (data && data.onboarding_completed === false && !onWelcome) {
          navigate('/welcome', { replace: true });
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  return null;
};

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <AppLayout>{children}</AppLayout>;
};

// /feed used to just redirect to "/" and silently drop any ?post=id, breaking
// direct post links (e.g. from the share preview). This preserves the query.
const FeedRedirect = () => {
  const location = useLocation();
  return <Navigate to={`/${location.search}`} replace />;
};

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <ReferralCapture />
            <OnboardingGate />
            <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/welcome" element={<Welcome />} />
            {/* Public TikTok-style feed - no login required */}
            <Route path="/" element={<TikTokFeed />} />
            <Route path="/index" element={<TikTokFeed />} />
            <Route path="/groups" element={
              <ProtectedRoute>
                <Groups />
              </ProtectedRoute>
            } />
            <Route path="/chat" element={
              <ProtectedRoute>
                <ChatHub />
              </ProtectedRoute>
            } />
            <Route path="/marketplace" element={
              <ProtectedRoute>
                <Marketplace />
              </ProtectedRoute>
            } />
            <Route path="/explore" element={
              <ProtectedRoute>
                <Explore />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/profile/:userId" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/notifications" element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="/admin" element={<Admin />} />
            <Route path="/star-marketplace" element={
              <ProtectedRoute>
                <StarMarketplace />
              </ProtectedRoute>
            } />
            <Route path="/vip-subscription" element={
              <ProtectedRoute>
                <VIPSubscription />
              </ProtectedRoute>
            } />
            <Route path="/contact-admin" element={<ContactAdmin />} />
            <Route path="/share" element={<SharePlatform />} />
            <Route path="/storyline" element={
              <ProtectedRoute>
                <Storyline />
              </ProtectedRoute>
            } />
            <Route path="/saved-searches" element={
              <ProtectedRoute>
                <SavedSearches />
              </ProtectedRoute>
            } />
            <Route path="/musician" element={
              <ProtectedRoute>
                <MusicianDashboard />
              </ProtectedRoute>
            } />
            <Route path="/wallet" element={
              <ProtectedRoute>
                <WalletPage />
              </ProtectedRoute>
            } />
            {/* Redirect old /feed to home - preserving any ?post= query param */}
            <Route path="/feed" element={<FeedRedirect />} />
            {/* Chat settings — Module B (global) */}
            <Route path="/chat/settings" element={<ProtectedRoute><GlobalSettings /></ProtectedRoute>} />
            <Route path="/chat/settings/requests" element={<ProtectedRoute><MessageRequests /></ProtectedRoute>} />
            <Route path="/chat/settings/privacy" element={<ProtectedRoute><GlobalPrivacy /></ProtectedRoute>} />
            <Route path="/chat/settings/delivery" element={<ProtectedRoute><MessageDelivery /></ProtectedRoute>} />
            <Route path="/chat/settings/delivery/:target" element={<ProtectedRoute><DeliveryTarget /></ProtectedRoute>} />
            <Route path="/chat/settings/blocked" element={<ProtectedRoute><BlockedAccounts /></ProtectedRoute>} />
            {/* Chat settings — Module A (per chat) */}
            <Route path="/chat/:partnerId/settings" element={<ProtectedRoute><ChatProfile /></ProtectedRoute>} />
            <Route path="/chat/:partnerId/settings/privacy" element={<ProtectedRoute><ChatPrivacy /></ProtectedRoute>} />
            <Route path="/chat/:partnerId/settings/disappearing" element={<ProtectedRoute><DisappearingMessages /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
