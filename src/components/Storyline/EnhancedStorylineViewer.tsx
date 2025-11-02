import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageCircle, X, ChevronLeft, ChevronRight, Eye, Star, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string;
  created_at: string;
  star_price: number;
  view_count: number;
  music_url: string | null;
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

export const EnhancedStorylineViewer: React.FC<StorylineViewerProps> = ({ userId, open, onClose }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [hasLiked, setHasLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [hasViewed, setHasViewed] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [userStarBalance, setUserStarBalance] = useState(0);

  useEffect(() => {
    if (open && userId) {
      loadStories();
      loadUserStarBalance();
    }
  }, [open, userId]);

  useEffect(() => {
    if (stories[currentIndex]) {
      checkLikeStatus();
      loadLikeCount();
      checkViewStatus();
      loadViewers();
    }
  }, [currentIndex, stories]);

  // Real-time updates for view count
  useEffect(() => {
    if (!stories[currentIndex]) return;
    
    const channel = supabase
      .channel('story-views')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'story_views',
          filter: `story_id=eq.${stories[currentIndex].id}`
        },
        () => {
          loadViewers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stories, currentIndex]);

  const loadUserStarBalance = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('star_balance')
      .eq('id', user.id)
      .single();
    setUserStarBalance(data?.star_balance || 0);
  };

  const loadStories = async () => {
    const { data, error } = await supabase
      .from('user_storylines')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading stories:', error);
      return;
    }

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

  const checkViewStatus = async () => {
    if (!user || !stories[currentIndex]) return;
    const { data } = await supabase
      .from('story_views')
      .select('id')
      .eq('story_id', stories[currentIndex].id)
      .eq('viewer_id', user.id)
      .maybeSingle();

    setHasViewed(!!data);
    
    const currentStory = stories[currentIndex];
    // Block if: story has star price AND user hasn't viewed it AND user has insufficient balance
    if (currentStory.star_price > 0 && !data) {
      if (userStarBalance === 0 || userStarBalance < currentStory.star_price) {
        setIsBlurred(true);
      } else {
        setIsBlurred(false);
      }
    } else {
      setIsBlurred(false);
    }
  };

  const handleUnlockStory = async () => {
    if (!user || !stories[currentIndex]) return;

    const currentStory = stories[currentIndex];
    
    if (userStarBalance === 0) {
      toast({
        title: 'No Stars Available',
        description: 'You need to purchase stars to view premium stories. Please buy stars to continue.',
        variant: 'destructive'
      });
      return;
    }

    if (userStarBalance < currentStory.star_price) {
      toast({
        title: 'Insufficient Stars',
        description: `You need ${currentStory.star_price} stars to view this story. You have ${userStarBalance} stars.`,
        variant: 'destructive'
      });
      return;
    }

    try {
      const { data, error } = await supabase.rpc('process_story_view', {
        p_story_id: currentStory.id,
        p_viewer_id: user.id
      });

      if (error) throw error;

      const result = data as any;
      
      if (result.success) {
        setIsBlurred(false);
        setHasViewed(true);
        await loadUserStarBalance();
        await loadViewers();
        toast({
          title: 'Story Unlocked!',
          description: `You earned ₦${result.viewer_earn} cashback!`,
        });
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to unlock story',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error unlocking story:', error);
      toast({
        title: 'Error',
        description: 'Failed to unlock story',
        variant: 'destructive'
      });
    }
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

  const loadViewers = async () => {
    if (!stories[currentIndex]) return;
    
    // Get story owner ID
    const storyOwnerId = stories[currentIndex].user_id;
    
    // Get all viewers
    const { data: viewData } = await supabase
      .from('story_views')
      .select(`
        viewer_id,
        viewed_at,
        stars_spent,
        user_profiles:viewer_id (
          username,
          avatar_url
        )
      `)
      .eq('story_id', stories[currentIndex].id)
      .order('viewed_at', { ascending: false });
    
    if (!viewData) return;
    
    // Get followers of the story owner
    const { data: followersData } = await supabase
      .from('followers')
      .select('follower_id')
      .eq('following_id', storyOwnerId);
    
    const followerIds = new Set(followersData?.map(f => f.follower_id) || []);
    
    // Sort viewers: followers first, then others
    const sortedViewers = [...viewData].sort((a, b) => {
      const aIsFollower = followerIds.has(a.viewer_id);
      const bIsFollower = followerIds.has(b.viewer_id);
      
      if (aIsFollower && !bIsFollower) return -1;
      if (!aIsFollower && bIsFollower) return 1;
      
      // If both are followers or both are not, sort by viewed_at
      return new Date(b.viewed_at).getTime() - new Date(a.viewed_at).getTime();
    });
    
    // Add follower flag to each viewer
    const viewersWithFollowerFlag = sortedViewers.map(viewer => ({
      ...viewer,
      isFollower: followerIds.has(viewer.viewer_id)
    }));
    
    setViewers(viewersWithFollowerFlag);
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
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md sm:max-w-lg h-[95vh] sm:h-[90vh] p-0 bg-black glass-card">
          <div className="relative h-full flex flex-col">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-20 p-3 sm:p-4 bg-gradient-to-b from-black/90 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Avatar className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-primary">
                    <AvatarImage src={currentStory.user?.avatar_url} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {currentStory.user?.username?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-white">
                    <p className="font-semibold text-sm sm:text-base">{currentStory.user?.username}</p>
                    <p className="text-xs text-gray-300">
                      {new Date(currentStory.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {currentStory.star_price > 0 && (
                    <Badge className="bg-yellow-500 text-black neon-glow text-xs">
                      {currentStory.star_price}<Star className="h-3 w-3 ml-1 inline fill-current" />
                    </Badge>
                  )}
                  <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Progress bars */}
              <div className="flex gap-1 mt-3">
                {stories.map((_, index) => (
                  <div
                    key={index}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      index === currentIndex ? 'bg-primary neon-glow' : 'bg-white/30'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Media */}
            <div className="flex-1 flex items-center justify-center relative">
              {isBlurred ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="absolute inset-0 backdrop-blur-3xl bg-black/50" />
                  <div className="relative z-10 text-center text-white space-y-4 p-6">
                    <Lock className="h-16 w-16 mx-auto" />
                    <h3 className="text-2xl font-bold">Unlock this Story</h3>
                    <p className="text-lg">Pay {currentStory.star_price} ⭐ to view</p>
                    <p className="text-sm">You'll earn ₦{currentStory.star_price * 500 * 0.2} cashback!</p>
                    <p className="text-xs text-gray-300">Your balance: {userStarBalance} ⭐</p>
                    <Button onClick={handleUnlockStory} size="lg" className="mt-4">
                      <Star className="mr-2" />
                      Unlock Story
                    </Button>
                  </div>
                </div>
              ) : (
                <>
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
                  
                  {currentStory.music_url && (
                    <audio src={currentStory.music_url} autoPlay loop className="hidden" />
                  )}
                </>
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

            {/* Caption - Always visible even when blurred */}
            {currentStory.caption && (
              <div className="absolute bottom-24 sm:bottom-28 left-0 right-0 px-3 sm:px-4 z-10">
                <p className={`text-white p-3 rounded-lg ${
                  isBlurred 
                    ? 'bg-black/90 text-xl sm:text-2xl font-bold text-shadow-3d' 
                    : 'bg-black/50 text-sm sm:text-base'
                }`}>
                  {currentStory.caption}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-black/90 to-transparent">
              <div className="flex items-center space-x-3 sm:space-x-4 mb-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLike}
                  className="text-white hover:bg-white/20 btn-3d"
                >
                  <Heart className={`h-5 w-5 sm:h-6 sm:w-6 ${hasLiked ? 'fill-red-500 text-red-500' : ''}`} />
                </Button>
                <span className="text-white text-sm sm:text-base">{likeCount}</span>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowViewers(true)}
                  className="text-white hover:bg-white/20 btn-3d"
                >
                  <Eye className="h-5 w-5 sm:h-6 sm:w-6" />
                </Button>
                <span className="text-white text-sm sm:text-base">{viewers.length}</span>
              </div>

              <div className="flex items-center space-x-2">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleComment()}
                />
                <Button onClick={handleComment} size="sm" className="btn-3d">
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Viewers Dialog */}
      <Dialog open={showViewers} onOpenChange={setShowViewers}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Story Viewers ({viewers.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-96">
            {viewers.length === 0 ? (
              <div className="text-center p-6 text-muted-foreground">
                No viewers yet
              </div>
            ) : (
              <>
                {/* Show followers section if there are any */}
                {viewers.some(v => v.isFollower) && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-primary mb-2 px-3">Top Viewers (Followers)</h4>
                    {viewers.filter(v => v.isFollower).map((viewer) => (
                      <div 
                        key={viewer.viewer_id} 
                        className="flex items-center justify-between p-3 hover:bg-muted rounded cursor-pointer glass-card mb-2"
                        onClick={() => {
                          setShowViewers(false);
                          window.location.href = `/profile/${viewer.viewer_id}`;
                        }}
                      >
                        <div className="flex items-center space-x-3">
                          <Avatar>
                            <AvatarImage src={viewer.user_profiles?.avatar_url} />
                            <AvatarFallback>{viewer.user_profiles?.username?.[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center space-x-2">
                              <p className="font-medium">{viewer.user_profiles?.username}</p>
                              <Badge variant="default" className="text-xs">Follower</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(viewer.viewed_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {viewer.stars_spent > 0 && (
                          <Badge variant="secondary">
                            {viewer.stars_spent}<Star className="h-3 w-3 ml-1 inline" />
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Show other viewers */}
                {viewers.filter(v => !v.isFollower).length > 0 && (
                  <div>
                    {viewers.some(v => v.isFollower) && (
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2 px-3">Other Viewers</h4>
                    )}
                    {viewers.filter(v => !v.isFollower).map((viewer) => (
                      <div 
                        key={viewer.viewer_id} 
                        className="flex items-center justify-between p-3 hover:bg-muted rounded cursor-pointer"
                        onClick={() => {
                          setShowViewers(false);
                          window.location.href = `/profile/${viewer.viewer_id}`;
                        }}
                      >
                        <div className="flex items-center space-x-3">
                          <Avatar>
                            <AvatarImage src={viewer.user_profiles?.avatar_url} />
                            <AvatarFallback>{viewer.user_profiles?.username?.[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{viewer.user_profiles?.username}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(viewer.viewed_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {viewer.stars_spent > 0 && (
                          <Badge variant="secondary">
                            {viewer.stars_spent}<Star className="h-3 w-3 ml-1 inline" />
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};
