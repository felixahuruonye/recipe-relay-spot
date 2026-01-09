import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, EyeOff, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const ReportsTab = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [postDetails, setPostDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadReports();
    
    const subscription = supabase
      .channel('reports-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'post_reports' }, 
        () => loadReports()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('post_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const list = data || [];
      // Attach reporter profiles (post_reports doesn't auto-join in this project)
      const reporterIds = Array.from(new Set(list.map((r: any) => r.reporter_user_id).filter(Boolean)));
      let reporterLookup: Record<string, any> = {};
      if (reporterIds.length) {
        const { data: reporters } = await supabase
          .from('user_profiles')
          .select('id, username, avatar_url')
          .in('id', reporterIds);
        (reporters || []).forEach((p: any) => {
          reporterLookup[p.id] = p;
        });
      }

      setReports(list.map((r: any) => ({ ...r, reporter: reporterLookup[r.reporter_user_id] })));
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewReportDetails = async (report: any) => {
    setSelectedReport(report);

    // Fetch post details
    const { data: post } = await supabase
      .from('posts')
      .select('*')
      .eq('id', report.post_id)
      .single();

    if (post?.user_id) {
      const { data: author } = await supabase
        .from('user_profiles')
        .select('username, avatar_url')
        .eq('id', post.user_id)
        .single();

      setPostDetails({ ...post, user: author || null });
      return;
    }

    setPostDetails(post);
  };

  const handleDeletePost = async () => {
    if (!selectedReport) return;

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', selectedReport.post_id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete post', variant: 'destructive' });
    } else {
      await supabase
        .from('post_reports')
        .update({ status: 'resolved', admin_action: 'deleted' })
        .eq('id', selectedReport.id);
      
      toast({ title: 'Success', description: 'Post deleted successfully' });
      setSelectedReport(null);
      setPostDetails(null);
      loadReports();
    }
  };

  const handleHidePost = async () => {
    if (!selectedReport) return;

    const { error } = await supabase
      .from('posts')
      .update({ status: 'hidden' })
      .eq('id', selectedReport.post_id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to hide post', variant: 'destructive' });
    } else {
      await supabase
        .from('post_reports')
        .update({ status: 'resolved', admin_action: 'hidden' })
        .eq('id', selectedReport.id);
      
      toast({ title: 'Success', description: 'Post hidden successfully' });
      setSelectedReport(null);
      setPostDetails(null);
      loadReports();
    }
  };

  const handleRestorePost = async () => {
    if (!selectedReport) return;

    const { error } = await supabase
      .from('posts')
      .update({ status: 'approved' })
      .eq('id', selectedReport.post_id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to restore post', variant: 'destructive' });
    } else {
      await supabase
        .from('post_reports')
        .update({ status: 'resolved', admin_action: 'restored' })
        .eq('id', selectedReport.id);
      
      toast({ title: 'Success', description: 'Post restored successfully' });
      setSelectedReport(null);
      setPostDetails(null);
      loadReports();
    }
  };

  const handleDismiss = async (reportId: string) => {
    const { error } = await supabase
      .from('post_reports')
      .update({ status: 'dismissed', admin_action: 'no_action' })
      .eq('id', reportId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to dismiss report', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Report dismissed' });
      loadReports();
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Post Reports ({reports.filter(r => r.status === 'pending').length} pending)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No reports yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Post ID</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>{report.reporter?.username || 'Unknown'}</TableCell>
                    <TableCell className="font-mono text-xs">{report.post_id}</TableCell>
                    <TableCell className="max-w-xs truncate">{report.reason}</TableCell>
                    <TableCell>
                      <Badge variant={report.status === 'pending' ? 'destructive' : 'secondary'}>
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(report.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {report.status === 'pending' && (
                          <>
                            <Button size="sm" onClick={() => viewReportDetails(report)}>
                              View
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleDismiss(report.id)}
                            >
                              Dismiss
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Report Details Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={(open) => {
        if (!open) {
          setSelectedReport(null);
          setPostDetails(null);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report Details</DialogTitle>
          </DialogHeader>
          
          {selectedReport && postDetails && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Report Information</h4>
                <div className="space-y-1 text-sm">
                  <p><strong>Reporter:</strong> {selectedReport.reporter?.username}</p>
                  <p><strong>Reason:</strong> {selectedReport.reason}</p>
                  <p><strong>Reported:</strong> {new Date(selectedReport.created_at).toLocaleString()}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Post Content</h4>
                <Card>
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{postDetails.user?.username}</span>
                      <Badge variant="outline">{postDetails.category}</Badge>
                    </div>
                    <h3 className="text-lg font-semibold">{postDetails.title}</h3>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="whitespace-pre-line">{postDetails.body}</p>
                    
                    {/* Media Display */}
                    {postDetails.media_urls && postDetails.media_urls.length > 0 && (
                      <div className="space-y-2">
                        {postDetails.media_urls.map((url: string, index: number) => {
                          const isVideo = url.match(/\.(mp4|webm|ogg)$/i) || url.includes('video');
                          return isVideo ? (
                            <video
                              key={index}
                              src={url}
                              controls
                              className="w-full rounded-lg max-h-96"
                            />
                          ) : (
                            <img
                              key={index}
                              src={url}
                              alt={`Post media ${index + 1}`}
                              className="w-full rounded-lg max-h-96 object-cover"
                            />
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedReport(null);
                    setPostDetails(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRestorePost}
                  disabled={postDetails.status === 'approved'}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Restore
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleHidePost}
                  disabled={postDetails.status === 'hidden'}
                >
                  <EyeOff className="w-4 h-4 mr-2" />
                  Hide
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeletePost}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
