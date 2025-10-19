import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus } from 'lucide-react';

interface StorylineCardProps {
  type: 'create' | 'story';
  onSelect?: () => void;
  previewUrl?: string;
  avatarUrl?: string;
  username?: string;
  isViewed?: boolean;
}

export const StorylineCard: React.FC<StorylineCardProps> = ({
  type,
  onSelect,
  previewUrl,
  avatarUrl,
  username,
  isViewed = false
}) => {
  if (type === 'create') {
    return (
      <div
        onClick={onSelect}
        className="flex-shrink-0 w-24 h-36 rounded-xl bg-gradient-to-b from-primary/20 to-primary/5 border-2 border-dashed border-primary/30 hover:border-primary/60 cursor-pointer transition-all flex flex-col items-center justify-center space-y-2 relative overflow-hidden group"
      >
        <div className="absolute top-2 left-1/2 -translate-x-1/2">
          <Avatar className="w-10 h-10 border-2 border-background">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback>You</AvatarFallback>
          </Avatar>
        </div>
        <div className="mt-8 w-8 h-8 rounded-full bg-primary flex items-center justify-center group-hover:scale-110 transition-transform">
          <Plus className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-xs font-medium text-center px-2">Create Story</span>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      className="flex-shrink-0 w-24 h-36 rounded-xl overflow-hidden cursor-pointer relative group"
    >
      {/* Preview Image */}
      <div className="absolute inset-0">
        {previewUrl ? (
          <img 
            src={previewUrl} 
            alt={username || 'Story'} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
      </div>

      {/* Avatar */}
      <div className="absolute top-2 left-2 z-10">
        <Avatar className={`w-10 h-10 border-2 ${isViewed ? 'border-muted' : 'border-primary'}`}>
          <AvatarImage src={avatarUrl} />
          <AvatarFallback>{username?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
      </div>

      {/* Username */}
      <div className="absolute bottom-2 left-2 right-2 z-10">
        <p className="text-xs font-medium text-white truncate drop-shadow-lg">
          {username}
        </p>
      </div>
    </div>
  );
};
