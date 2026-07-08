// Lightweight pub/sub to pause any playing background media (feed videos,
// storyline audio, sound pickers) when a foreground surface such as the
// Create Post wizard opens.
export const MEDIA_PAUSE_EVENT = 'lenory:media:pause-all';

export function pauseAllBackgroundMedia() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(MEDIA_PAUSE_EVENT));
  // Defensive fallback: also directly pause every <video>/<audio> in the DOM
  // so anything that hasn't wired up the event still stops.
  try {
    document.querySelectorAll<HTMLMediaElement>('video, audio').forEach((el) => {
      if (!el.paused) {
        try { el.pause(); } catch { /* noop */ }
      }
    });
  } catch { /* noop */ }
}

export function onMediaPause(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(MEDIA_PAUSE_EVENT, handler);
  return () => window.removeEventListener(MEDIA_PAUSE_EVENT, handler);
}
