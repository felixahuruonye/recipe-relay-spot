import React, { useEffect, useRef } from 'react';



const AdsterraFeedCard: React.FC = () => {

  const adRef = useRef<HTMLDivElement>(null);



  useEffect(() => {

    if (!adRef.current) return;

    // Clear previous ad if any

    adRef.current.innerHTML = '';

    const script = document.createElement('script');

    script.src = 'https://pl29820258.effectivecpmnetwork.com/8a/10/5e/8a105e3622d182d4c07ebe16fe07848b.js';

    script.async = true;

    adRef.current.appendChild(script);

  }, []);



  return (

    <div className="relative w-full rounded-2xl overflow-hidden border border-border/50 bg-card shadow-sm my-2">

      {/* Ad Label */}

      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">

        <span className="text-xs text-muted-foreground font-medium">Sponsored</span>

        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">Ad</span>

      </div>

      {/* Ad Content */}

      <div

        ref={adRef}

        className="w-full min-h-[100px] flex items-center justify-center"

      />

    </div>

  );

};



export default AdsterraFeedCard;