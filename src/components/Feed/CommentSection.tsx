import { useState, useEffect } from 'react';
import { Send, Heart, Flag, Trash2, Edit2, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  is_hidden: boolean;
  is_edited: boolean;
  user_profile?: {
    username: string;
    avatar_url?: string;
  };
  reactions?: any[];
  replies?: Reply[];
}

interface Reply {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_profile?: {
    username: string;
    avatar_url?: string;
  };
}

export const CommentSection = ({ postId }: { postId: string }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [longPressTarget, setLongPressTarget] = useState<string | null>(null);
  const [showReplies, setShowReplies] = useState<{ [key: string]: boolean }>({});
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchComments();
    setupRealtimeSubscription();
  }, [postId]);

  const fetchComments = async () => {
    const { data: commentsData } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (commentsData) {
      // Fetch user profiles for comments
      const userIds = [...new Set(commentsData.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);

      const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Fetch reactions and replies for each comment
      const commentsWithExtras = await Promise.all(
        commentsData.map(async (comment) => {
          const { data: reactions } = await supabase
            .from('comment_reactions')
            .select('user_id')
            .eq('comment_id', comment.id);

          // Fetch usernames for reactions
          const reactionUserIds = reactions?.map(r => r.user_id) || [];
          const { data: reactionProfiles } = reactionUserIds.length > 0
            ? await supabase
                .from('user_profiles')
                .select('id, username')
                .in('id', reactionUserIds)
            : { data: null };

          const reactionsWithProfiles = reactions?.map(r => ({
            ...r,
            user_profile: reactionProfiles?.find(p => p.id === r.user_id),
          })) || [];

          const { data: replies } = await supabase
            .from('comment_replies')
            .select('*')
            .eq('comment_id', comment.id)
            .order('created_at', { ascending: true });

          // Fetch profiles for replies
          const replyUserIds = [...new Set(replies?.map(r => r.user_id) || [])];
          const { data: replyProfiles } = replyUserIds.length > 0
            ? await supabase
                .from('user_profiles')
                .select('id, username, avatar_url')
                .in('id', replyUserIds)
            : { data: null };

          const replyProfilesMap = new Map(replyProfiles?.map(p => [p.id, p]) || []);

          const repliesWithProfiles = replies?.map(r => ({
            ...r,
            user_profile: replyProfilesMap.get(r.user_id),
          })) || [];

          return {
            ...comment,
            user_profile: profilesMap.get(comment.user_id),
            reactions: reactionsWithProfiles,
            replies: repliesWithProfiles,
          };
        })
      );

      setComments(commentsWithExtras as Comment[]);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel(`comments-${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`,
        },
        () => fetchComments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user) return;

    const { error } = await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: user.id,
      content: newComment.trim(),
    });

    if (error) {
      toast({ title: 'Error', description: 'Failed to add comment', variant: 'destructive' });
    } else {
      setNewComment('');
      fetchComments();
    }
  };

  const handleReply = async (commentId: string) => {
    if (!replyContent.trim() || !user) return;

    const { error } = await supabase.from('comment_replies').insert({
      comment_id: commentId,
      user_id: user.id,
      content: replyContent.trim(),
    });

    if (error) {
      toast({ title: 'Error', description: 'Failed to add reply', variant: 'destructive' });
    } else {
      setReplyContent('');
      setReplyTo(null);
      fetchComments();
    }
  };

  const handleReaction = async (commentId: string) => {
    if (!user) return;

    const comment = comments.find((c) => c.id === commentId);
    const hasReacted = comment?.reactions?.some((r: any) => r.user_id === user.id);

    if (hasReacted) {
      await supabase
        .from('comment_reactions')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id);
    } else {
      await supabase.from('comment_reactions').insert({
        comment_id: commentId,
        user_id: user.id,
      });
    }

    fetchComments();
  };

  const handleEdit = async (commentId: string) => {
    if (!editContent.trim()) return;

    const { error } = await supabase
      .from('post_comments')
      .update({ content: editContent.trim(), is_edited: true })
      .eq('id', commentId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update comment', variant: 'destructive' });
    } else {
      setEditingComment(null);
      setEditContent('');
      fetchComments();
    }
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase.from('post_comments').delete().eq('id', commentId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete comment', variant: 'destructive' });
    } else {
      fetchComments();
    }
  };

  const handleHide = async (commentId: string) => {
    const { error } = await supabase
      .from('post_comments')
      .update({ is_hidden: true })
      .eq('id', commentId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to hide comment', variant: 'destructive' });
    } else {
      fetchComments();
    }
  };

  const handleReport = async (commentId: string, reason: string) => {
    if (!user) return;

    const { error } = await supabase.from('comment_reports').insert({
      comment_id: commentId,
      reporter_user_id: user.id,
      reason,
    });

    if (error) {
      toast({ title: 'Error', description: 'Failed to report comment', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Comment reported' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          rows={2}
          className="flex-1"
        />
        <Button onClick={handleAddComment} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {comments.map((comment) => {
          const isOwner = user?.id === comment.user_id;
          const hasReacted = comment.reactions?.some((r: any) => r.user_id === user?.id);

          return (
            <div key={comment.id} className="space-y-2">
              <div className="flex gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={comment.user_profile?.avatar_url} />
                  <AvatarFallback>
                    {comment.user_profile?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1">
                  <div className="bg-muted rounded-lg p-3">
                    <p className="font-semibold text-sm">{comment.user_profile?.username}</p>
                    {editingComment === comment.id ? (
                      <div className="space-y-2 mt-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleEdit(comment.id)}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingComment(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm mt-1">{comment.content}</p>
                    )}
                    {comment.is_edited && (
                      <p className="text-xs text-muted-foreground mt-1">(edited)</p>
                    )}
                  </div>

                  <div className="flex gap-4 mt-2 text-sm">
                    <button
                      onClick={() => handleReaction(comment.id)}
                      className={`flex items-center gap-1 ${hasReacted ? 'text-red-500' : 'text-muted-foreground'} hover:text-red-500`}
                    >
                      <Heart className={`h-4 w-4 ${hasReacted ? 'fill-current' : ''}`} />
                      {comment.reactions?.length || 0}
                    </button>

                    <button
                      onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Reply
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="text-muted-foreground hover:text-foreground">
                          More
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {isOwner ? (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingComment(comment.id);
                                setEditContent(comment.content);
                              }}
                            >
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(comment.id)}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleHide(comment.id)}>
                              <EyeOff className="h-4 w-4 mr-2" />
                              Hide
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleReport(comment.id, 'Inappropriate content')}
                          >
                            <Flag className="h-4 w-4 mr-2" />
                            Report
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {comment.replies && comment.replies.length > 0 && (
                      <button
                        onClick={() =>
                          setShowReplies((prev) => ({ ...prev, [comment.id]: !prev[comment.id] }))
                        }
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {showReplies[comment.id] ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                      </button>
                    )}
                  </div>

                  {replyTo === comment.id && (
                    <div className="flex gap-2 mt-2">
                      <Textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Write a reply..."
                        rows={2}
                        className="flex-1"
                      />
                      <Button onClick={() => handleReply(comment.id)} size="icon">
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {showReplies[comment.id] && comment.replies && (
                    <div className="ml-4 mt-3 space-y-3 border-l-2 border-muted pl-4">
                      {comment.replies.map((reply) => (
                        <div key={reply.id} className="flex gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={reply.user_profile?.avatar_url} />
                            <AvatarFallback>
                              {reply.user_profile?.username?.[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="bg-muted rounded-lg p-2">
                              <p className="font-semibold text-xs">
                                {reply.user_profile?.username}
                              </p>
                              <p className="text-sm mt-1">{reply.content}</p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(reply.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
