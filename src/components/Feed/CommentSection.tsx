import { useState, useEffect, useRef } from 'react';
import { Send, Heart, Flag, Trash2, Edit2, EyeOff, ChevronDown, ChevronUp, Plus, Smile, X, Image as ImageIcon } from 'lucide-react';
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

export const CommentSection = ({ postId }: { postId: string }) => {
  const [comments, setComments] = useState<Comment[]>([]);
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
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchComments();
    const channel = supabase
      .channel(`comments-${postId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` }, () => fetchComments())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_replies' }, () => fetchComments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [postId]);

  const fetchComments = async () => {
    const { data: commentsData } = await supabase
      .from('post_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    if (!commentsData) return;
    const userIds = [...new Set(commentsData.map((c: any) => c.user_id))];
    const { data: profiles } = await supabase.from('user_profiles').select('id, username, avatar_url').in('id', userIds);
    const profilesMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

    const result = await Promise.all(commentsData.map(async (comment: any) => {
      const { data: reactions } = await supabase.from('comment_reactions').select('user_id').eq('comment_id', comment.id);
      const { data: replies } = await supabase.from('comment_replies').select('*').eq('comment_id', comment.id).order('created_at', { ascending: true });
      const replyUserIds = [...new Set((replies || []).map((r: any) => r.user_id))];
      const { data: rprof } = replyUserIds.length
        ? await supabase.from('user_profiles').select('id, username, avatar_url').in('id', replyUserIds)
        : { data: [] as any[] };
      const rpMap = new Map((rprof || []).map((p: any) => [p.id, p]));
      return {
        ...comment,
        user_profile: profilesMap.get(comment.user_id),
        reactions: reactions || [],
        replies: (replies || []).map((r: any) => ({ ...r, user_profile: rpMap.get(r.user_id) })),
      };
    }));
    setComments(result as Comment[]);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/comments/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('post-media').upload(path, file);
    if (error) { toast({ title: 'Upload failed', description: error.message, variant: 'destructive' }); return null; }
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
    setNewComment(''); setNewCommentImage(null); setShowStickers(false);
    fetchComments();
  };

  const addSticker = (s: string) => {
    setNewComment(prev => prev + s);
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
    setReplyContent(''); setReplyImage(null); setReplyTo(null);
    fetchComments();
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
    fetchComments();
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;
    await supabase.from('post_comments').update({ content: editContent.trim(), is_edited: true }).eq('id', id);
    setEditingComment(null); setEditContent(''); fetchComments();
  };
  const handleDelete = async (id: string) => { await supabase.from('post_comments').delete().eq('id', id); fetchComments(); };
  const handleHide = async (id: string) => { await supabase.from('post_comments').update({ is_hidden: true }).eq('id', id); fetchComments(); };
  const handleReport = async (id: string) => {
    if (!user) return;
    await supabase.from('comment_reports').insert({ comment_id: id, reporter_user_id: user.id, reason: 'Inappropriate' });
    toast({ title: 'Reported' });
  };

  return (
    <div className="space-y-4">
      {/* Composer */}
      <div className="space-y-2">
        {newCommentImage && (
          <div className="relative inline-block">
            <img src={URL.createObjectURL(newCommentImage)} alt="" className="h-20 rounded-lg" />
            <button onClick={() => setNewCommentImage(null)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {showStickers && (
          <div className="grid grid-cols-8 gap-1 p-2 bg-muted rounded-lg">
            {STICKERS.map(s => (
              <button key={s} onClick={() => addSticker(s)} className="text-2xl hover:scale-125 transition-transform">{s}</button>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e => setNewCommentImage(e.target.files?.[0] || null)} />
          <Button size="icon" variant="outline" onClick={() => fileInputRef.current?.click()} title="Attach image"><Plus className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" onClick={() => setShowStickers(s => !s)} title="Stickers"><Smile className="h-4 w-4" /></Button>
          <Textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            rows={1}
            className="flex-1 min-h-[40px]"
          />
          <Button onClick={handleAddComment} size="icon"><Send className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Comments list */}
      <div className="space-y-4">
        {comments.map(comment => {
          const isOwner = user?.id === comment.user_id;
          const hasReacted = comment.reactions?.some((r: any) => r.user_id === user?.id);
          return (
            <div key={comment.id} className="space-y-2">
              <div className="flex gap-3">
                <Avatar className="h-8 w-8"><AvatarImage src={comment.user_profile?.avatar_url} /><AvatarFallback>{comment.user_profile?.username?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
                <div className="flex-1">
                  <div className="bg-muted rounded-lg p-3">
                    <p className="font-semibold text-sm">{comment.user_profile?.username}</p>
                    {editingComment === comment.id ? (
                      <div className="space-y-2 mt-2">
                        <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={2} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleEdit(comment.id)}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingComment(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {comment.content && <p className="text-sm mt-1 whitespace-pre-wrap break-words">{comment.content}</p>}
                        {comment.image_url && <img src={comment.image_url} alt="" className="mt-2 rounded-lg max-h-48" />}
                      </>
                    )}
                    {comment.is_edited && <p className="text-xs text-muted-foreground mt-1">(edited)</p>}
                  </div>

                  <div className="flex gap-4 mt-2 text-sm">
                    <button onClick={() => handleReaction(comment.id)} className={`flex items-center gap-1 ${hasReacted ? 'text-red-500' : 'text-muted-foreground'}`}>
                      <Heart className={`h-4 w-4 ${hasReacted ? 'fill-current' : ''}`} /> {comment.reactions?.length || 0}
                    </button>
                    <button onClick={() => setReplyTo(replyTo?.commentId === comment.id && !replyTo?.parentReplyId ? null : { commentId: comment.id, toUsername: comment.user_profile?.username })} className="text-muted-foreground">Reply</button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button className="text-muted-foreground">More</button></DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {isOwner ? (<>
                          <DropdownMenuItem onClick={() => { setEditingComment(comment.id); setEditContent(comment.content); }}><Edit2 className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(comment.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleHide(comment.id)}><EyeOff className="h-4 w-4 mr-2" />Hide</DropdownMenuItem>
                        </>) : (
                          <DropdownMenuItem onClick={() => handleReport(comment.id)}><Flag className="h-4 w-4 mr-2" />Report</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {comment.replies && comment.replies.length > 0 && (
                      <button onClick={() => setShowReplies(p => ({ ...p, [comment.id]: !p[comment.id] }))} className="text-muted-foreground flex items-center gap-1">
                        {showReplies[comment.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                      </button>
                    )}
                  </div>

                  {/* Reply composer for the parent comment */}
                  {replyTo?.commentId === comment.id && !replyTo?.parentReplyId && (
                    <ReplyComposer
                      replyImage={replyImage} setReplyImage={setReplyImage}
                      replyContent={replyContent} setReplyContent={setReplyContent}
                      onSend={() => handleReply(comment.id)} onCancel={() => setReplyTo(null)}
                      toUsername={replyTo.toUsername} fileRef={replyFileRef}
                    />
                  )}

                  {showReplies[comment.id] && comment.replies && (
                    <div className="ml-4 mt-3 space-y-3 border-l-2 border-muted pl-4">
                      {comment.replies.map(reply => (
                        <div key={reply.id} className="space-y-1">
                          <div className="flex gap-2">
                            <Avatar className="h-6 w-6"><AvatarImage src={reply.user_profile?.avatar_url} /><AvatarFallback>{reply.user_profile?.username?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
                            <div className="flex-1">
                              <div className="bg-muted rounded-lg p-2">
                                <p className="font-semibold text-xs">{reply.user_profile?.username}</p>
                                {reply.content && <p className="text-sm mt-1 whitespace-pre-wrap break-words">{reply.content}</p>}
                                {reply.image_url && <img src={reply.image_url} alt="" className="mt-2 rounded-lg max-h-40" />}
                              </div>
                              <div className="flex gap-3 mt-1 text-xs">
                                <span className="text-muted-foreground">{new Date(reply.created_at).toLocaleString()}</span>
                                <button
                                  className="text-muted-foreground hover:text-primary font-medium"
                                  onClick={() => setReplyTo(replyTo?.parentReplyId === reply.id ? null : { commentId: comment.id, parentReplyId: reply.id, toUsername: reply.user_profile?.username })}
                                >
                                  Reply
                                </button>
                              </div>
                            </div>
                          </div>
                          {replyTo?.commentId === comment.id && replyTo?.parentReplyId === reply.id && (
                            <div className="ml-8">
                              <ReplyComposer
                                replyImage={replyImage} setReplyImage={setReplyImage}
                                replyContent={replyContent} setReplyContent={setReplyContent}
                                onSend={() => handleReply(comment.id, reply.id)} onCancel={() => setReplyTo(null)}
                                toUsername={replyTo.toUsername} fileRef={replyFileRef}
                              />
                            </div>
                          )}
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

const ReplyComposer: React.FC<ReplyComposerProps> = ({ replyContent, setReplyContent, replyImage, setReplyImage, onSend, onCancel, toUsername, fileRef }) => {
  const [showS, setShowS] = useState(false);
  return (
    <div className="mt-2 space-y-2">
      {replyImage && (
        <div className="relative inline-block">
          <img src={URL.createObjectURL(replyImage)} alt="" className="h-16 rounded-lg" />
          <button onClick={() => setReplyImage(null)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {showS && (
        <div className="grid grid-cols-8 gap-1 p-2 bg-muted rounded-lg">
          {STICKERS.map(s => (
            <button key={s} onClick={() => setReplyContent(replyContent + s)} className="text-xl hover:scale-125 transition-transform">{s}</button>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => setReplyImage(e.target.files?.[0] || null)} />
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => fileRef.current?.click()}><Plus className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setShowS(s => !s)}><Smile className="h-3.5 w-3.5" /></Button>
        <Textarea
          value={replyContent}
          onChange={e => setReplyContent(e.target.value)}
          placeholder={toUsername ? `Reply to @${toUsername}...` : 'Write a reply...'}
          rows={1}
          className="flex-1 min-h-[36px] text-sm"
        />
        <Button onClick={onSend} size="icon" className="h-8 w-8"><Send className="h-3.5 w-3.5" /></Button>
        <Button onClick={onCancel} size="icon" variant="ghost" className="h-8 w-8"><X className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
};
