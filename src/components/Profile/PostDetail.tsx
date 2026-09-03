import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Heart, MessageCircle, Share2, ArrowLeft, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { VideoPlayer } from '@/components/Feed/VideoPlayer';

interface Post {
  id: string;
  title: string;
  body: string;
  media_urls: string[];
  user_id: string;
  created_at: string;
  view_count: number;
}

interface UserProfile {
  username: string;
  avatar_url: string;
  full_name: string;
}

const PostDetail = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  const [post, setPost] = useState<Post | null>(null);
  const [author, setAuthor] = useState<UserProfile | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const postId = searchParams.get('post');

  useEffect(() => {
    if (postId) {
      fetchPost();
    }
  }, [postId]);

  const fetchPost = async () => {
    if (!postId) return;
    try {
      const { data: postData, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

      if (error) throw error;
      setPost(postData);

      // Fetch author profile
      const { data: authorData } = await supabase
        .from('user_profiles')
        .select('username, avatar_url, full_name')
        .eq('id', postData.user_id)
        .single();
      setAuthor(authorData);

      // Fetch likes
      const { data: likesData, count } = await supabase
        .from('post_likes')
        .select('*', { count: 'exact' })
        .eq('post_id', postId);

      setLikeCount(count || 0);
      if (user) {
        setIsLiked(likesData?.some(like => like.user_id === user.id) || false);
      }

      // Fetch comment count
      const { count: commentsCount } = await supabase
        .from('post_comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      setCommentCount(commentsCount || 0);

      // Record view
      await supabase
        .from('post_views')
        .insert({ post_id: postId, user_id: user?.id });

    } catch (error) {
      console.error('Error fetching post:', error);
      toast({ title: 'Error', description: 'Failed to load post', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!user || !postId) return;

    try {
      if (isLiked) {
        await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);
        setLikeCount(Math.max(0, likeCount - 1));
        setIsLiked(false);
      } else {
        await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: user.id });
        setLikeCount(likeCount + 1);
        setIsLiked(true);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handlePromote = () => {
    toast({
      title: 'Promote Video',
      description: 'Promotion feature coming soon!',
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!post || !author) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Post not found</p>
          <Button onClick={() => navigate('/profile')}>Back to Profile</Button>
        </div>
      </div>
    );
  }

  const mediaUrl = post.media_urls?.[0];
  const isVideo = mediaUrl?.match(/\.(mp4|webm|ogg|mov)$/i) || mediaUrl?.includes('video');

  return (
    <div className="fixed inset-0 bg-black z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/profile')} className="text-white">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <p className="text-white font-semibold">Post</p>
      </div>

      {/* Main Content */}
      <div className="flex flex-col md:flex-row h-[calc(100vh-60px)]">
        
        {/* Media Section */}
        <div className="flex-1 bg-black flex items-center justify-center min-h-[50vh] md:min-h-full">
          {mediaUrl ? (
            isVideo ? (
              <VideoPlayer src={mediaUrl} />
            ) : (
              <img
                src={mediaUrl}
                alt={post.title}
                className="w-full h-full object-contain"
              />
            )
          ) : (
            <div className="text-center">
              <p className="text-muted-foreground">{post.title}</p>
            </div>
          )}
        </div>

        {/* Right Sidebar - Actions */}
        <div className="w-full md:w-32 bg-black/50 p-4 flex flex-col items-center gap-6 justify-start pt-20">
          
          {/* Author Avatar */}
          <button
            onClick={() => navigate(`/profile/${post.user_id}`)}
            className="flex flex-col items-center gap-2"
          >
            <Avatar className="w-12 h-12 border-2 border-white">
              <AvatarImage src={author.avatar_url} />
              <AvatarFallback>{author.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
          </button>

          {/* Like Button */}
          <button
            onClick={handleLike}
            className="flex flex-col items-center gap-2 text-white hover:text-red-500 transition-colors"
          >
            <div className={`p-3 rounded-full border-2 ${isLiked ? 'border-red-500 bg-red-500/20' : 'border-white/30'}`}>
              <Heart className={`w-6 h-6 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
            </div>
            <span className="text-sm font-semibold text-white">{likeCount}</span>
          </button>

          {/* Comment Button */}
          <button
            onClick={() => toast({ title: 'Comments', description: 'Comment feature coming soon!' })}
            className="flex flex-col items-center gap-2 text-white hover:text-primary transition-colors"
          >
            <div className="p-3 rounded-full border-2 border-white/30 hover:border-white/50">
              <MessageCircle className="w-6 h-6" />
            </div>
            <span className="text-sm font-semibold text-white">{commentCount}</span>
          </button>

          {/* Share Button */}
          <button
            onClick={() => toast({ title: 'Share', description: 'Share feature coming soon!' })}
            className="flex flex-col items-center gap-2 text-white hover:text-primary transition-colors"
          >
            <div className="p-3 rounded-full border-2 border-white/30 hover:border-white/50">
              <Share2 className="w-6 h-6" />
            </div>
          </button>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="sticky bottom-0 bg-black/80 backdrop-blur border-t border-white/10 p-4 space-y-3">
        
        {/* Post Info */}
        <div className="flex items-start gap-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={author.avatar_url} />
            <AvatarFallback>{author.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-white font-semibold">@{author.username}</p>
            <p className="text-white/70 text-sm mt-1">{post.body}</p>
          </div>
        </div>

        {/* Promote Button */}
        <Button
          onClick={handlePromote}
          className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-bold py-3 rounded-full text-lg"
        >
          <Zap className="w-5 h-5 mr-2" />
          PROMOTE VIDEO
        </Button>
      </div>
    </div>
  );
};

export default PostDetail;
