import React from 'react';
import { FileText, Play } from 'lucide-react';

interface MediaMessageProps {
  url: string;
  isOwn: boolean;
}

export const MediaMessage: React.FC<MediaMessageProps> = ({ url, isOwn }) => {
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url) || url.includes('image');
  const isVideo = /\.(mp4|webm|ogg)$/i.test(url) || url.includes('video');
  const isAudio = /\.(webm|mp3|wav|ogg|m4a)$/i.test(url) && url.includes('voice');

  if (isAudio) {
    return (
      <audio controls className="max-w-[200px]" preload="metadata">
        <source src={url} />
      </audio>
    );
  }

  if (isImage) {
    return (
      <img src={url} alt="Shared" className="max-w-[200px] rounded-lg cursor-pointer" onClick={() => window.open(url, '_blank')} loading="lazy" />
    );
  }

  if (isVideo) {
    return (
      <video controls className="max-w-[200px] rounded-lg" preload="metadata">
        <source src={url} />
      </video>
    );
  }

  // Document
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs underline">
      <FileText className="w-4 h-4" />
      View Document
    </a>
  );
};
