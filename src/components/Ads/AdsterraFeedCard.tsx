import React, { useEffect, useRef } from 'react';

const AdsterraFeedCard: React.FC = () => {
  const adRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!adRef.current) return;

    // Clear previous ad
    adRef.current.innerHTML = '';

    // Create container div that Adsterra needs
    const container = document.createElement('div');
    container.id = 'container-3b04b13ae3e9053be4b1f122939f9364';
    adRef.current.appendChild(container);

    // Load Adsterra Native Banner script
    const script = document.createElement('script');
    script.src = 'https://pl29885385.effectivecpmnetwork.com/3b04b13ae3e9053be4b1f122939f9364/invoke.js';
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    adRef.current.appendChild(script);

    return () => {
      if (adRef.current) adRef.current.innerHTML = '';
    };
  }, []);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-border/50 bg-card shadow-sm my-2">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <span className="text-xs text-muted-foreground font-medium">Sponsored</span>
        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">Ad</span>
      </div>
      <div ref={adRef} className="w-full min-h-[120px]" />
    </div>
  );
};

export default AdsterraFeedCard;