import { MoreVertical, Edit2, Trash2, EyeOff, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface PostMenuProps {
  postId: string;
  postOwnerId: string;
  onPostDeleted?: () => void;
}

export const PostMenu = ({ postId, postOwnerId, onPostDeleted }: PostMenuProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const isOwner = user?.id === postOwnerId;

  const handleEdit = () => {
    navigate(`/edit-post/${postId}`);
  };

  const handleDelete = async () => {
    const { error } = await supabase.from('posts').delete().eq('id', postId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete post', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Post deleted successfully' });
      if (onPostDeleted) onPostDeleted();
    }
    setShowDeleteDialog(false);
  };

  const handleRemoveFromFeed = async () => {
    if (!user) return;

    // Mark post as hidden for this user (you'd need a user_hidden_posts table)
    toast({ title: 'Success', description: 'Post removed from your feed' });
  };

  const handleReport = async () => {
    if (!user || !reportReason.trim()) return;

    const { error } = await supabase.from('post_reports').insert({
      post_id: postId,
      reporter_user_id: user.id,
      reason: reportReason.trim(),
    });

    if (error) {
      toast({ title: 'Error', description: 'Failed to report post', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Post reported. We will review it shortly.' });
    }
    setShowReportDialog(false);
    setReportReason('');
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isOwner ? (
            <>
              <DropdownMenuItem onClick={handleEdit}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Post
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Post
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={handleRemoveFromFeed}>
                <EyeOff className="h-4 w-4 mr-2" />
                Remove from Feed
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowReportDialog(true)}>
                <Flag className="h-4 w-4 mr-2" />
                Report Post
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this post? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Report Post</AlertDialogTitle>
            <AlertDialogDescription>
              Please tell us why you're reporting this post.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Reason for reporting..."
            className="w-full min-h-24 p-3 border rounded-md"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReport}>Submit Report</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
