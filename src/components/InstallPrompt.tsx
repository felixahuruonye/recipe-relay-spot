import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download } from 'lucide-react';

// Shows a dismissible banner offering to install the app to the home
// screen - visible whether or not the person is logged in, since it's
// about how the app runs (full-screen, no browser chrome), not account
// state. Chrome/Android only fire beforeinstallprompt when the PWA
// criteria (manifest + service worker) are already met, which this app
// already has - the banner just surfaces that option instead of relying
// on someone to find it buried in the browser's own menu.
export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const alreadyInstalled = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (alreadyInstalled) return;
    if (sessionStorage.getItem('install-prompt-dismissed') === '1') setDismissed(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('install-prompt-dismissed', '1');
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-[70] rounded-2xl bg-card border border-primary/30 shadow-lg p-3 flex items-center gap-3">
      <div className="p-2 rounded-full bg-primary/15 shrink-0">
        <Download className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">Install Lenory Social</p>
        <p className="text-xs text-muted-foreground">Faster, full-screen, no browser bar - just like a real app.</p>
      </div>
      <Button size="sm" onClick={handleInstall}>Install</Button>
      <button onClick={handleDismiss} className="p-1 text-muted-foreground shrink-0" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default InstallPrompt;
