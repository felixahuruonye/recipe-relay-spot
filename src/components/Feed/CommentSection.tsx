import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Heart, Flag, Trash2, Edit2, EyeOff, ChevronDown, ChevronUp, Plus, Smile, X, Image as ImageIcon, Camera, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STICKERS = ['❤️','🔥','👏','😂','😮','😍','😢','🙌','💯','⭐','🎉','👍','💔','🙏','✨','🤔'];
const QUICK_REACTIONS = ['❤️', '😍', '😂', '😭', '🔥', '🙏', '😊'];

// Deterministic pastel color from username for Snapchat-style avatars
const avatarColor = (name: string) => {
  const colors = [
    'bg-blue-500', 'bg-teal-400', 'bg-purple-500', 'bg-pink-500',
    'bg-indigo-500', 'bg-rose-400', 'bg-cyan-500', 'bg-amber-500',
  ];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
};

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d`;
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo`;
  return `${Math.floor(s / 31536000)}y`;
};

interface Reply {
  id: string;
  user_id: string;
  content: string;
  image_url?: string | null;
  parent_reply_id?: string | null;
  created_at: string;
  user_profile?: { username: string; avatar_url?: string };
}

interface Comment {
  id: string;
  user_id: string;
  content: string;
  image_url?: string | null;
  created_at: string;
  is_hidden: boolean;
  is_edited: boolean;
  user_profile?: { username: string; avatar_url?: string };
  reactions?: any[];
  replies?: Reply[];
}

interface CommentSectionProps {
  postId: string;
  onCountChange?: (count: number) => void;
}

export const CommentSection = ({ postId, onCountChange }: CommentSectionProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [newCommentImage, setNewCommentImage] = useState<File | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [replyTo, setReplyTo] = useState<{ commentId: string; parentReplyId?: string; toUsername?: string } | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showReplies, setShowReplies] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchComments = useCallback(async () => {
    const { data: commentsData } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .eq('is_hidden', false)
      .order('created_at', { ascending: true });

    if (!commentsData) {
      setLoading(false);
      return;
    }

    const userIds = [...new Set(commentsData.map((c: any) => c.user_id))];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);
    const profilesMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

    // Batch reactions + replies in fewer round-trips
    const commentIds = commentsData.map((c: any) => c.id);
    const [{ data: allReactions }, { data: allReplies }] = await Promise.all([
      supabase.from('comment_reactions').select('comment_id, user_id').in('comment_id', commentIds),
      supabase.from('comment_replies').select('*').in('comment_id', commentIds).order('created_at', { ascending: true }),
    ]);

    const replyUserIds = [...new Set((allReplies || []).map((r: any) => r.user_id))];
    const { data: rprof } = replyUserIds.length
      ? await supabase.from('user_profiles').select('id, username, avatar_url').in('id', replyUserIds)
      : { data: [] as any[] };
    const rpMap = new Map((rprof || []).map((p: any) => [p.id, p]));

    const reactionsByComment: Record<string, any[]> = {};
    (allReactions || []).forEach((r: any) => {
      if (!reactionsByComment[r.comment_id]) reactionsByComment[r.comment_id] = [];
      reactionsByComment[r.comment_id].push(r);
    });

    const repliesByComment: Record<string, Reply[]> = {};
    (allReplies || []).forEach((r: any) => {
      if (!repliesByComment[r.comment_id]) repliesByComment[r.comment_id] = [];
      repliesByComment[r.comment_id].push({ ...r, user_profile: rpMap.get(r.user_id) });
    });

    const result = commentsData.map((comment: any) => ({
      ...comment,
      user_profile: profilesMap.get(comment.user_id),
      reactions: reactionsByComment[comment.id] || [],
      replies: repliesByComment[comment.id] || [],
    }));

    setComments(result as Comment[]);
    onCountChange?.(result.length);
    setLoading(false);
  }, [postId, onCountChange]);

  useEffect(() => {
    setLoading(true);
    fetchComments();
    const channel = supabase
      .channel(`comments-${postId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` }, () => fetchComments())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_replies' }, () => fetchComments())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_reactions' }, () => fetchComments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [postId, fetchComments]);

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/comments/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('post-media').upload(path, file);
    if (error) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
      return null;
    }
    return supabase.storage.from('post-media').getPublicUrl(path).data.publicUrl;
  };

  const handleAddComment = async () => {
    if ((!newComment.trim() && !newCommentImage) || !user) return;
    let image_url: string | null = null;
    if (newCommentImage) image_url = await uploadImage(newCommentImage);

    const { error } = await supabase.from('post_comments').insert({
      post_id: postId, user_id: user.id, content: newComment.trim(), image_url,
    } as any);
    if (error) {
      toast({ title: 'Error', description: 'Failed to add comment', variant: 'destructive' });
      return;
    }
    // Optimistic local count bump – real data arrives via realtime
    onCountChange?.(comments.length + 1);
    setNewComment('');
    setNewCommentImage(null);
    setShowStickers(false);
    // Soft scroll to bottom after post
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 300);
  };

  const handleQuickReaction = (emoji: string) => {
    setNewComment(prev => prev + emoji);
  };

  const handleReply = async (commentId: string, parentReplyId?: string) => {
    if ((!replyContent.trim() && !replyImage) || !user) return;
    let image_url: string | null = null;
    if (replyImage) image_url = await uploadImage(replyImage);
    const { error } = await supabase.from('comment_replies').insert({
      comment_id: commentId, user_id: user.id, content: replyContent.trim(),
      image_url, parent_reply_id: parentReplyId || null,
    } as any);
    if (error) {
      toast({ title: 'Error', description: 'Failed to add reply', variant: 'destructive' });
      return;
    }
    setReplyContent('');
    setReplyImage(null);
    setReplyTo(null);
  };

  const handleReaction = async (commentId: string) => {
    if (!user) return;
    const c = comments.find(x => x.id === commentId);
    const has = c?.reactions?.some((r: any) => r.user_id === user.id);
    if (has) {
      await supabase.from('comment_reactions').delete().eq('comment_id', commentId).eq('user_id', user.id);
    } else {
      await supabase.from('comment_reactions').insert({ comment_id: commentId, user_id: user.id });
    }
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;
    await supabase.from('post_comments').update({ content: editContent.trim(), is_edited: true }).eq('id', id);
    setEditingComment(null);
    setEditContent('');
  };
  const handleDelete = async (id: string) => {
    await supabase.from('post_comments').delete().eq('id', id);
  };
  const handleHide = async (id: string) => {
    await supabase.from('post_comments').update({ is_hidden: true }).eq('id', id);
  };
  const handleReport = async (id: string) => {
    if (!user) return;
    await supabase.from('comment_reports').insert({ comment_id: id, reporter_user_id: user.id, reason: 'Inappropriate' });
    toast({ title: 'Reported' });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Comments list – Snapchat style */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 pt-1 pb-2 space-y-4">
        {loading && comments.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading comments…</div>
        )}
        {!loading && comments.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">No comments yet. Be the first!</div>
        )}

        {comments.map(comment => {
          const isOwner = user?.id === comment.user_id;
          const hasReacted = comment.reactions?.some((r: any) => r.user_id === user?.id);
          const uname = comment.user_profile?.username || 'user';
          const color = avatarColor(uname);

          return (
            <div key={comment.id} className="space-y-1">
              <div className="flex gap-2.5">
                <Avatar className={`h-9 w-9 shrink-0 ${color}`}>
                  <AvatarImage src={comment.user_profile?.avatar_url} />
                  <AvatarFallback className="text-white text-sm font-semibold bg-transparent">
                    {uname[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="font-semibold text-[13px] text-foreground">{uname}</span>
                    <span className="text-[11px] text-muted-foreground">· {timeAgo(comment.created_at)}</span>
                    {comment.is_edited && <span className="text-[10px] text-muted-foreground">(edited)</span>}
                  </div>

                  {editingComment === comment.id ? (
                    <div className="space-y-2 mt-1">
                      <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={2} className="text-sm" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleEdit(comment.id)}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingComment(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {comment.content && (
                        <p className="text-[13px] leading-snug mt-0.5 whitespace-pre-wrap break-words text-foreground/90">
                          {comment.content}
                        </p>
                      )}
                      {comment.image_url && (
                        <img src={comment.image_url} alt="" className="mt-1.5 rounded-lg max-h-40 object-cover" />
                      )}
                    </>
                  )}

                  <div className="flex items-center gap-3 mt-1.5 text-[12px]">
                    <button
                      onClick={() => handleReaction(comment.id)}
                      className={`flex items-center gap-0.5 ${hasReacted ? 'text-red-500' : 'text-muted-foreground'}`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${hasReacted ? 'fill-current' : ''}`} />
                      {(comment.reactions?.length || 0) > 0 && (
                        <span className="tabular-nums">{comment.reactions?.length}</span>
                      )}
                    </button>
                    <button
                      onClick={() =>
                        setReplyTo(
                          replyTo?.commentId === comment.id && !replyTo?.parentReplyId
                            ? null
                            : { commentId: comment.id, toUsername: uname }
                        )
                      }
                      className="text-muted-foreground font-medium hover:text-foreground"
                    >
                      Reply
                    </button>
                    {comment.replies && comment.replies.length > 0 && (
                      <button
                        onClick={() => setShowReplies(p => ({ ...p, [comment.id]: !p[comment.id] }))}
                        className="text-blue-500 font-medium"
                      >
                        {showReplies[comment.id] ? 'Hide' : 'Show'} {comment.replies.length}{' '}
                        {comment.replies.length === 1 ? 'reply' : 'replies'}
                      </button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="text-muted-foreground ml-auto">···</button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isOwner ? (
                          <>
                            <DropdownMenuItem onClick={() => { setEditingComment(comment.id); setEditContent(comment.content); }}>
                              <Edit2 className="h-4 w-4 mr-2" />Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(comment.id)}>
                              <Trash2 className="h-4 w-4 mr-2" />Delete
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleHide(comment.id)}>
                              <EyeOff className="h-4 w-4 mr-2" />Hide
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <DropdownMenuItem onClick={() => handleReport(comment.id)}>
                            <Flag className="h-4 w-4 mr-2" />Report
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Nested reply composer */}
                  {replyTo?.commentId === comment.id && !replyTo?.parentReplyId && (
                    <ReplyComposer
                      replyImage={replyImage}
                      setReplyImage={setReplyImage}
                      replyContent={replyContent}
                      setReplyContent={setReplyContent}
                      onSend={() => handleReply(comment.id)}
                      onCancel={() => setReplyTo(null)}
                      toUsername={replyTo.toUsername}
                      fileRef={replyFileRef}
                    />
                  )}

                  {/* Replies */}
                  {showReplies[comment.id] && comment.replies && comment.replies.length > 0 && (
                    <div className="mt-2 ml-1 space-y-3 border-l-2 border-border/60 pl-3">
                      {comment.replies.map(reply => {
                        const rname = reply.user_profile?.username || 'user';
                        const rcolor = avatarColor(rname);
                        return (
                          <div key={reply.id} className="flex gap-2">
                            <Avatar className={`h-7 w-7 shrink-0 ${rcolor}`}>
                              <AvatarImage src={reply.user_profile?.avatar_url} />
                              <AvatarFallback className="text-white text-xs font-semibold bg-transparent">
                                {rname[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-1.5">
                                <span className="font-semibold text-[12px]">{rname}</span>
                                <span className="text-[10px] text-muted-foreground">· {timeAgo(reply.created_at)}</span>
                              </div>
                              {reply.content && (
                                <p className="text-[12px] leading-snug mt-0.5 whitespace-pre-wrap break-words">
                                  {reply.content}
                                </p>
                              )}
                              {reply.image_url && (
                                <img src={reply.image_url} alt="" className="mt-1 rounded-md max-h-32 object-cover" />
                              )}
                              <button
                                className="text-[11px] text-muted-foreground font-medium mt-0.5 hover:text-foreground"
                                onClick={() =>
                                  setReplyTo(
                                    replyTo?.parentReplyId === reply.id
                                      ? null
                                      : { commentId: comment.id, parentReplyId: reply.id, toUsername: rname }
                                  )
                                }
                              >
                                Reply
                              </button>
                              {replyTo?.commentId === comment.id && replyTo?.parentReplyId === reply.id && (
                                <ReplyComposer
                                  replyImage={replyImage}
                                  setReplyImage={setReplyImage}
                                  replyContent={replyContent}
                                  setReplyContent={setReplyContent}
                                  onSend={() => handleReply(comment.id, reply.id)}
                                  onCancel={() => setReplyTo(null)}
                                  toUsername={replyTo.toUsername}
                                  fileRef={replyFileRef}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick emoji reaction bar (Snapchat style) */}
      <div className="flex items-center justify-around px-2 py-2 border-t border-border/50 bg-background/95">
        {QUICK_REACTIONS.map(e => (
          <button
            key={e}
            onClick={() => handleQuickReaction(e)}
            className="text-xl leading-none p-1.5 rounded-full hover:bg-muted active:scale-90 transition-transform"
          >
            {e}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-background">
        {newCommentImage && (
          <div className="relative inline-block mb-2">
            <img src={URL.createObjectURL(newCommentImage)} alt="" className="h-16 rounded-lg" />
            <button
              onClick={() => setNewCommentImage(null)}
              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {showStickers && (
          <div className="grid grid-cols-8 gap-1 p-2 mb-2 bg-muted rounded-lg">
            {STICKERS.map(s => (
              <button key={s} onClick={() => setNewComment(prev => prev + s)} className="text-xl hover:scale-125 transition-transform">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-orange-400 text-white text-xs">
              {user?.email?.[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 flex items-center gap-1 bg-muted/60 rounded-full px-3 py-1.5 min-h-[36px]">
            <input
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAddComment())}
              placeholder="Add a comment..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
            />
            <button className="text-muted-foreground p-0.5" title="Mention">
              <AtSign className="h-4 w-4" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e => setNewCommentImage(e.target.files?.[0] || null)} />
            <button onClick={() => fileInputRef.current?.click()} className="text-muted-foreground p-0.5" title="Photo">
              <Camera className="h-4 w-4" />
            </button>
            <button onClick={() => setShowStickers(s => !s)} className="text-muted-foreground p-0.5" title="Stickers">
              <Smile className="h-4 w-4" />
            </button>
          </div>
          {(newComment.trim() || newCommentImage) && (
            <Button size="icon" className="h-8 w-8 rounded-full shrink-0" onClick={handleAddComment}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

interface ReplyComposerProps {
  replyContent: string;
  setReplyContent: (v: string) => void;
  replyImage: File | null;
  setReplyImage: (f: File | null) => void;
  onSend: () => void;
  onCancel: () => void;
  toUsername?: string;
  fileRef: React.RefObject<HTMLInputElement>;
}

const ReplyComposer: React.FC<ReplyComposerProps> = ({
  replyContent, setReplyContent, replyImage, setReplyImage, onSend, onCancel, toUsername, fileRef,
}) => {
  return (
    <div className="mt-2 space-y-1.5">
      {replyImage && (
        <div className="relative inline-block">
          <img src={URL.createObjectURL(replyImage)} alt="" className="h-14 rounded-md" />
          <button onClick={() => setReplyImage(null)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <div className="flex gap-1.5 items-center">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => setReplyImage(e.target.files?.[0] || null)} />
        <input
          value={replyContent}
          onChange={e => setReplyContent(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), onSend())}
          placeholder={toUsername ? `Reply to @${toUsername}...` : 'Write a reply...'}
          className="flex-1 text-sm bg-muted/50 rounded-full px-3 py-1.5 outline-none"
        />
        <Button onClick={onSend} size="sm" className="h-7 px-3 rounded-full text-xs">Send</Button>
        <Button onClick={onCancel} size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
