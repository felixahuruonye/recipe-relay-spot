import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heart, MessageCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string;
  created_at: string;
  user?: {
    username: string;
    avatar_url: string;
  };
}

interface StorylineViewerProps {
  userId: string;
  open: boolean;
  onClose: () => void;
}

export const StorylineViewer: React.FC<StorylineViewerProps> = ({ userId, open, onClose }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [hasLiked, setHasLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  useEffect(() => {
    if (open && userId) {
      loadStories();
    }
  }, [open, userId]);

  useEffect(() => {
    if (stories[currentIndex]) {
      checkLikeStatus();
      loadLikeCount();
    }
  }, [currentIndex, stories]);

  const loadStories = async () => {
    const { data, error } = await supabase
      .from('user_storylines')
      .select('*')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading stories:', error);
      return;
    }

    // Fetch user profiles separately
    const userIds = [...new Set(data?.map(s => s.user_id) || [])];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]));

    const storiesWithUsers = data?.map(story => ({
      ...story,
      user: profileMap.get(story.user_id)
    })) || [];

    setStories(storiesWithUsers as any);
  };

  const checkLikeStatus = async () => {
    if (!user || !stories[currentIndex]) return;

    const { data } = await supabase
      .from('storyline_reactions')
      .select('id')
      .eq('storyline_id', stories[currentIndex].id)
      .eq('user_id', user.id)
      .maybeSingle();

    setHasLiked(!!data);
  };

  const loadLikeCount = async () => {
    if (!stories[currentIndex]) return;

    const { count } = await supabase
      .from('storyline_reactions')
      .select('*', { count: 'exact', head: true })
      .eq('storyline_id', stories[currentIndex].id);

    setLikeCount(count || 0);
  };

  const handleLike = async () => {
    if (!user || !stories[currentIndex]) return;

    try {
      if (hasLiked) {
        await supabase
          .from('storyline_reactions')
          .delete()
          .eq('storyline_id', stories[currentIndex].id)
          .eq('user_id', user.id);
        setHasLiked(false);
        setLikeCount(Math.max(0, likeCount - 1));
      } else {
        await supabase
          .from('storyline_reactions')
          .insert({
            storyline_id: stories[currentIndex].id,
            user_id: user.id
          });
        setHasLiked(true);
        setLikeCount(likeCount + 1);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast({ title: 'Error', description: 'Failed to update reaction', variant: 'destructive' });
    }
  };

  const handleComment = async () => {
    if (!user || !stories[currentIndex] || !comment.trim()) return;

    try {
      // Send comment as a private message to story owner
      const { error } = await supabase
        .from('private_messages')
        .insert({
          from_user_id: user.id,
          to_user_id: currentStory.user_id,
          message: `💬 Story comment: ${comment.trim()}`
        });

      if (error) throw error;
      
      toast({ title: 'Success', description: 'Comment sent to chat!' });
      setComment('');
    } catch (error) {
      console.error('Error sending comment:', error);
      toast({ title: 'Error', description: 'Failed to send comment', variant: 'destructive' });
    }
  };

  const goNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (!stories[currentIndex]) return null;

  const currentStory = stories[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md h-[90vh] p-0 bg-black">
        <div className="relative h-full flex flex-col">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={currentStory.user?.avatar_url} />
                  <AvatarFallback>{currentStory.user?.username?.[0]}</AvatarFallback>
                </Avatar>
                <div className="text-white">
                  <p className="font-semibold">{currentStory.user?.username}</p>
                  <p className="text-xs text-gray-300">
                    {new Date(currentStory.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5 text-white" />
              </Button>
            </div>

            {/* Progress bars */}
            <div className="flex gap-1 mt-3">
              {stories.map((_, index) => (
                <div
                  key={index}
                  className={`h-1 flex-1 rounded-full ${
                    index === currentIndex ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Media */}
          <div className="flex-1 flex items-center justify-center">
            {currentStory.media_type === 'video' ? (
              <video
                src={currentStory.media_url}
                controls
                className="max-h-full max-w-full"
                autoPlay
              />
            ) : (
              <img
                src={currentStory.media_url}
                alt="Story"
                className="max-h-full max-w-full object-contain"
              />
            )}

            {/* Navigation */}
            {currentIndex > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white"
                onClick={goPrev}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
            )}
            {currentIndex < stories.length - 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white"
                onClick={goNext}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            )}
          </div>

          {/* Caption */}
          {currentStory.caption && (
            <div className="absolute bottom-24 left-0 right-0 px-4">
              <p className="text-white bg-black/50 p-2 rounded">{currentStory.caption}</p>
            </div>
          )}

          {/* Actions */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center space-x-4 mb-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLike}
                className="text-white"
              >
                <Heart className={`h-6 w-6 ${hasLiked ? 'fill-red-500 text-red-500' : ''}`} />
              </Button>
              <span className="text-white">{likeCount}</span>
            </div>

            <div className="flex items-center space-x-2">
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50"
                onKeyDown={(e) => e.key === 'Enter' && handleComment()}
              />
              <Button onClick={handleComment} size="sm">
                <MessageCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
