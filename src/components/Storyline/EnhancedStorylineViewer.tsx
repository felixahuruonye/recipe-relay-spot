import React, { useState, useEffect, useRef } from 'react';
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
import { useNavigate } from 'react-router-dom';

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
    story_settings?: any;
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
  const navigate = useNavigate();
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
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [imageTimer, setImageTimer] = useState<number | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (open && userId) {
      loadStories();
      loadUserStarBalance();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, userId]);

  useEffect(() => {
    if (stories[currentIndex]) {
      checkLikeStatus();
      loadLikeCount();
      checkViewStatus();
      loadViewers();
      checkCommentsEnabled();
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

  // Auto payment timer for images (30 seconds) and video end
  useEffect(() => {
    if (!stories[currentIndex] || isBlurred || hasViewed || isProcessingPayment) return;
    
    const currentStory = stories[currentIndex];
    
    // If free story or own story, just record view
    if (currentStory.star_price === 0 || currentStory.user_id === user?.id) {
      recordFreeView();
      return;
    }
    
    // For paid content - start timer for images
    if (currentStory.media_type !== 'video') {
      setImageTimer(30);
      timerRef.current = setInterval(() => {
        setImageTimer(prev => {
          if (prev === null || prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            // Process payment after timer ends
            processAutoPayment();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setImageTimer(null);
    };
  }, [currentIndex, stories, isBlurred, hasViewed]);

  const recordFreeView = async () => {
    if (!user || !stories[currentIndex] || hasViewed) return;
    
    const currentStory = stories[currentIndex];
    
    // Check if already viewed
    const { data: existingView } = await supabase
      .from('story_views')
      .select('id')
      .eq('story_id', currentStory.id)
      .eq('viewer_id', user.id)
      .maybeSingle();
    
    if (existingView) {
      setHasViewed(true);
      return;
    }
    
    // Record free view
    await supabase.from('story_views').insert({
      story_id: currentStory.id,
      viewer_id: user.id,
      stars_spent: 0
    });
    
    setHasViewed(true);
    loadViewers();
  };

  const processAutoPayment = async () => {
    if (!user || !stories[currentIndex] || hasViewed || isProcessingPayment) return;
    
    setIsProcessingPayment(true);
    const currentStory = stories[currentIndex];
    
    try {
      const { data, error } = await supabase.rpc('process_story_view', {
        p_story_id: currentStory.id,
        p_viewer_id: user.id
      });

      if (error) throw error;

      const result = data as any;
      
      if (result.success) {
        setHasViewed(true);
        await loadUserStarBalance();
        await loadViewers();
        
        if (result.charged) {
          toast({
            title: 'Story Unlocked!',
            description: `You earned ₦${result.viewer_earn} cashback! Stars deducted: ${currentStory.star_price}`,
          });
        }
      } else if (result.error === 'Insufficient stars') {
        setIsBlurred(true);
        toast({
          title: 'Insufficient Stars',
          description: `You need ${currentStory.star_price} stars to view this story.`,
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error processing payment:', error);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleVideoEnd = () => {
    if (!hasViewed && !isBlurred) {
      processAutoPayment();
    }
  };

  const checkCommentsEnabled = async () => {
    if (!stories[currentIndex]) return;
    
    const creatorId = stories[currentIndex].user_id;
    const { data } = await supabase
      .from('user_profiles')
      .select('story_settings')
      .eq('id', creatorId)
      .single();
    
    if (data?.story_settings && typeof data.story_settings === 'object') {
      const settings = data.story_settings as any;
      setCommentsEnabled(settings.comments_enabled !== false);
    } else {
      setCommentsEnabled(true);
    }
  };

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
      .select('id, username, avatar_url, story_settings, age')
      .in('id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]));

    let filteredStories = data || [];
    
    if (user && userId !== user.id) {
      const creatorProfile = profileMap.get(userId);
      const viewerProfile = await supabase
        .from('user_profiles')
        .select('age')
        .eq('id', user.id)
        .single();

      if (creatorProfile?.story_settings) {
        const settings = creatorProfile.story_settings as any;
        
        if (settings.show_only_me) {
          filteredStories = [];
        }
        
        if (settings.show_to_followers) {
          const { data: followData } = await supabase
            .from('followers')
            .select('id')
            .eq('follower_id', user.id)
            .eq('following_id', userId)
            .maybeSingle();
          
          if (!followData) {
            filteredStories = [];
          }
        }
        
        if (settings.audience_control && settings.min_age) {
          const viewerAge = viewerProfile?.data?.age;
          if (!viewerAge || viewerAge < settings.min_age) {
            filteredStories = [];
            toast({
              title: 'Age Restricted',
              description: `You must be at least ${settings.min_age} years old to view these stories.`,
              variant: 'destructive'
            });
          }
        }
      }
    }

    const storiesWithUsers = filteredStories.map(story => ({
      ...story,
      user: profileMap.get(story.user_id)
    }));

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
        description: 'You need to purchase stars to view premium stories.',
        variant: 'destructive'
      });
      return;
    }

    if (userStarBalance < currentStory.star_price) {
      toast({
        title: 'Insufficient Stars',
        description: `You need ${currentStory.star_price} stars. You have ${userStarBalance}.`,
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
    
    const storyOwnerId = stories[currentIndex].user_id;
    
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
    
    const { data: followersData } = await supabase
      .from('followers')
      .select('follower_id')
      .eq('following_id', storyOwnerId);
    
    const followerIds = new Set(followersData?.map(f => f.follower_id) || []);
    
    const sortedViewers = [...viewData].sort((a, b) => {
      const aIsFollower = followerIds.has(a.viewer_id);
      const bIsFollower = followerIds.has(b.viewer_id);
      
      if (aIsFollower && !bIsFollower) return -1;
      if (!aIsFollower && bIsFollower) return 1;
      
      return new Date(b.viewed_at).getTime() - new Date(a.viewed_at).getTime();
    });
    
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

    if (!commentsEnabled) {
      toast({ 
        title: 'Comments Disabled', 
        description: 'The creator has disabled comments for their stories',
        variant: 'destructive' 
      });
      return;
    }

    const currentStory = stories[currentIndex];

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
    if (timerRef.current) clearInterval(timerRef.current);
    setImageTimer(null);
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setImageTimer(null);
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleViewerClick = (viewerId: string) => {
    setShowViewers(false);
    navigate(`/profile/${viewerId}`);
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
                  {imageTimer !== null && (
                    <Badge className="bg-primary text-primary-foreground animate-pulse">
                      {imageTimer}s
                    </Badge>
                  )}
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
                      ref={videoRef}
                      src={currentStory.media_url}
                      controls
                      className="max-h-full max-w-full"
                      autoPlay
                      onEnded={handleVideoEnd}
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

            {/* Caption */}
            {currentStory.caption && (
              <div className="absolute bottom-24 sm:bottom-28 left-0 right-0 px-3 sm:px-4 z-10">
                <p className={`text-white p-3 rounded-lg ${
                  isBlurred 
                    ? 'bg-black/90 text-xl sm:text-2xl font-bold' 
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

              {/* Comment input - only show if comments are enabled */}
              {commentsEnabled && (
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
              )}
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
                {viewers.some(v => v.isFollower) && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-primary mb-2 px-3">Top Viewers (Followers)</h4>
                    {viewers.filter(v => v.isFollower).map((viewer) => (
                      <div 
                        key={viewer.viewer_id} 
                        className="flex items-center justify-between p-3 hover:bg-muted rounded cursor-pointer glass-card mb-2"
                        onClick={() => handleViewerClick(viewer.viewer_id)}
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
                
                {viewers.filter(v => !v.isFollower).length > 0 && (
                  <div>
                    {viewers.some(v => v.isFollower) && (
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2 px-3">Other Viewers</h4>
                    )}
                    {viewers.filter(v => !v.isFollower).map((viewer) => (
                      <div 
                        key={viewer.viewer_id} 
                        className="flex items-center justify-between p-3 hover:bg-muted rounded cursor-pointer"
                        onClick={() => handleViewerClick(viewer.viewer_id)}
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