import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trash2, RefreshCw, Lock, ShieldAlert } from 'lucide-react';
import { ReportsTab } from '@/components/Admin/ReportsTab';
import { VIPManager } from '@/components/Admin/VIPManager';
import { StoryManagement } from '@/components/Admin/StoryManagement';
import { AdminChat } from '@/components/Admin/AdminChat';
import { UserBalancesTab } from '@/components/Admin/UserBalancesTab';
import { WithdrawalsTab } from '@/components/Admin/WithdrawalsTab';
import { BroadcastTab } from '@/components/Admin/BroadcastTab';
import { StarPackagesTab } from '@/components/Admin/StarPackagesTab';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const AdminPanel = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Check admin role on mount - SERVER-SIDE verification via RLS
  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) {
        setIsCheckingAuth(false);
        return;
      }

      try {
        // Use the has_role function to verify admin status server-side
        const { data, error } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });

        if (error) {
          console.error('Admin check error:', error);
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(data === true);
        }
      } catch (error) {
        console.error('Admin verification failed:', error);
        setIsAuthenticated(false);
      }
      setIsCheckingAuth(false);
    };

    checkAdminRole();
  }, [user]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, postsRes, tasksRes] = await Promise.all([
        supabase.from('user_profiles').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('posts').select('*, user_profiles(username, avatar_url)').order('created_at', { ascending: false }).limit(50),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(50)
      ]);

      if (usersRes.data) setUsers(usersRes.data);
      if (postsRes.data) setPosts(postsRes.data);
      if (tasksRes.data) setTasks(tasksRes.data);
    } catch (error) {
      console.error('Load error:', error);
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
    }
    setLoading(false);
  };

  const updatePostStatus = async (postId: string, newStatus: string) => {
    const { error } = await supabase
      .from('posts')
      .update({ status: newStatus })
      .eq('id', postId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: `Post ${newStatus}` });
      loadData();
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', taskId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: `Task ${newStatus}` });
      loadData();
    }
  };

  const deletePost = async (postId: string) => {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Post deleted" });
      loadData();
    }
  };

  // Loading state while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Authentication Required</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              You must be logged in to access the admin panel.
            </p>
            <Button onClick={() => navigate('/auth')} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not an admin
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              You do not have admin privileges. This incident has been logged.
            </p>
            <Button onClick={() => navigate('/')} variant="outline" className="w-full">
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-green-500 border-green-500">
              Admin Verified
            </Badge>
            <Button onClick={loadData} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex w-max gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="balances">User Balances</TabsTrigger>
              <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
              <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
              <TabsTrigger value="messages">Admin Messages</TabsTrigger>
              <TabsTrigger value="posts">Posts</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="vip">VIP</TabsTrigger>
              <TabsTrigger value="stars">Star Packages</TabsTrigger>
              <TabsTrigger value="stories">Stories</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div>Users loaded: {users.length}</div>
                  <div>Posts loaded: {posts.length}</div>
                  <div>Tasks loaded: {tasks.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Common Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button className="w-full" variant="outline" onClick={loadData} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh all
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Admin Tools</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div>Use “User Balances” to edit wallet/stars.</div>
                  <div>Use “Withdrawals” to process requests.</div>
                  <div>Use “Star Packages” to set purchase URLs.</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="balances">
            <UserBalancesTab />
          </TabsContent>

          <TabsContent value="withdrawals">
            <WithdrawalsTab />
          </TabsContent>

          <TabsContent value="broadcast">
            <BroadcastTab />
          </TabsContent>

          <TabsContent value="messages">
            <Card>
              <CardHeader>
                <CardTitle>Admin → User Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <AdminChat />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="posts">
            <Card>
              <CardHeader>
                <CardTitle>Post Management ({posts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Author</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posts.map((post: any) => (
                      <TableRow key={post.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{post.title}</TableCell>
                        <TableCell>{post.user_profiles?.username || 'Unknown'}</TableCell>
                        <TableCell>
                          <Badge variant={post.status === 'approved' ? 'default' : 'secondary'}>
                            {post.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{post.view_count || 0}</TableCell>
                        <TableCell>{new Date(post.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {post.status !== 'approved' && (
                              <Button size="sm" onClick={() => updatePostStatus(post.id, 'approved')}>
                                Approve
                              </Button>
                            )}
                            {post.status !== 'rejected' && (
                              <Button size="sm" variant="outline" onClick={() => updatePostStatus(post.id, 'rejected')}>
                                Reject
                              </Button>
                            )}
                            <Button size="sm" variant="destructive" onClick={() => deletePost(post.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks">
            <Card>
              <CardHeader>
                <CardTitle>Task Management ({tasks.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Reward</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Workers</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task: any) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.task_name}</TableCell>
                        <TableCell>{task.category}</TableCell>
                        <TableCell>₦{task.reward_amount}</TableCell>
                        <TableCell>
                          <Badge variant={task.status === 'approved' ? 'default' : 'secondary'}>
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{task.worker_count}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {task.status !== 'approved' && (
                              <Button size="sm" onClick={() => updateTaskStatus(task.id, 'approved')}>
                                Approve
                              </Button>
                            )}
                            {task.status !== 'rejected' && (
                              <Button size="sm" variant="outline" onClick={() => updateTaskStatus(task.id, 'rejected')}>
                                Reject
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <ReportsTab />
          </TabsContent>

          <TabsContent value="vip">
            <VIPManager />
          </TabsContent>

          <TabsContent value="stars">
            <StarPackagesTab />
          </TabsContent>

          <TabsContent value="stories">
            <StoryManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminPanel;
