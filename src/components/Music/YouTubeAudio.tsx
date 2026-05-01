import React, { useEffect, useRef } from 'react';

// Hidden YouTube IFrame player used for background audio playback.
// Renders an off-screen iframe and controls play/pause via postMessage API.
interface YouTubeAudioProps {
  videoId: string;
  playing: boolean;
  muted: boolean;
  volume?: number; // 0-100
  loop?: boolean;
  onEnded?: () => void;
}

const YouTubeAudio: React.FC<YouTubeAudioProps> = ({ videoId, playing, muted, volume = 50, loop = true, onEnded }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);

  // Send commands via postMessage
  const send = (func: string, args: any[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*'
    );
  };

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      try {
        const data = JSON.parse(e.data);
        if (data.event === 'onReady') {
          readyRef.current = true;
          send('setVolume', [volume]);
          if (muted) send('mute'); else send('unMute');
          if (playing) send('playVideo');
        }
        if (data.event === 'onStateChange' && data.info === 0) {
          // ended
          if (loop) send('playVideo');
          onEnded?.();
        }
      } catch {}
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [videoId]);

  useEffect(() => {
    if (!readyRef.current) return;
    if (playing) send('playVideo'); else send('pauseVideo');
  }, [playing]);

  useEffect(() => {
    if (!readyRef.current) return;
    if (muted) send('mute'); else send('unMute');
  }, [muted]);

  useEffect(() => {
    if (!readyRef.current) return;
    send('setVolume', [volume]);
  }, [volume]);

  if (!videoId) return null;

  // enablejsapi=1 + origin needed for postMessage control
  const src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=${playing ? 1 : 0}&controls=0&loop=${loop ? 1 : 0}&playlist=${videoId}&modestbranding=1&playsinline=1&rel=0`;

  return (
    <iframe
      ref={iframeRef}
      src={src}
      allow="autoplay; encrypted-media"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
        left: -9999,
        top: -9999,
      }}
      title="background-audio"
    />
  );
};

export default YouTubeAudio;
