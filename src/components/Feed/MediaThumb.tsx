import React from 'react';

export const isVideoUrl = (u?: string | null) =>
  !!u && /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(u);

interface MediaThumbProps {
  url?: string | null;
  thumbnailUrl?: string | null;
  mediaType?: string | null;
  alt?: string;
  className?: string;
}

/**
 * Renders a media preview that works for both images and videos.
 * - If a thumbnail_url exists, prefer it (image tag, fast)
 * - If the media is a video (by media_type or extension), render a <video preload="metadata"> so the browser shows the first frame
 * - Otherwise render <img>
 */
export const MediaThumb: React.FC<MediaThumbProps> = ({
  url,
  thumbnailUrl,
  mediaType,
  alt = '',
  className = '',
}) => {
  if (!url && !thumbnailUrl) {
    return <div className={`bg-gradient-to-br from-primary/30 to-accent/30 ${className}`} />;
  }
  const isVideo = mediaType === 'video' || isVideoUrl(url);
  if (thumbnailUrl) {
    return <img src={thumbnailUrl} alt={alt} className={`object-cover ${className}`} loading="lazy" />;
  }
  if (isVideo && url) {
    return (
      <video
        src={url}
        className={`object-cover ${className}`}
        muted
        playsInline
        preload="metadata"
      />
    );
  }
  return <img src={url || ''} alt={alt} className={`object-cover ${className}`} loading="lazy" />;
};

export default MediaThumb;
