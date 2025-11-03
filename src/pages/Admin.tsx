import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trash2, RefreshCw, Lock } from 'lucide-react';
import { ReportsTab } from '@/components/Admin/ReportsTab';
import { VIPManager } from '@/components/Admin/VIPManager';
import { StoryManagement } from '@/components/Admin/StoryManagement';

const AdminPanel = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const handleLogin = () => {
    if (password === 'Felix333666') {
      setIsAuthenticated(true);
      toast({ title: "Welcome Admin", description: "Access granted" });
    } else {
      toast({ 
        title: "Access Denied", 
        description: "Incorrect password",
        variant: "destructive" 
      });
    }
  };

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

  // Set up realtime subscriptions
  useEffect(() => {
    if (!isAuthenticated) return;

    const postsSubscription = supabase
      .channel('posts-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'posts' }, 
        () => loadData()
      )
      .subscribe();

    const tasksSubscription = supabase
      .channel('tasks-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'tasks' }, 
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(postsSubscription);
      supabase.removeChannel(tasksSubscription);
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-primary" />
            <CardTitle>Admin Login</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <Button onClick={handleLogin} className="w-full">
              Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <div className="flex gap-2">
            <Button onClick={loadData} disabled={loading} variant="outline">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={() => setIsAuthenticated(false)} variant="outline">
              Logout
            </Button>
          </div>
        </div>

        <Tabs defaultValue="posts" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="stories">Stories</TabsTrigger>
            <TabsTrigger value="vip">VIP/Users</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
          </TabsList>

          <TabsContent value="posts">
            <Card>
              <CardHeader>
                <CardTitle>Posts Management ({posts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posts.map((post: any) => (
                      <TableRow key={post.id}>
                        <TableCell className="max-w-xs truncate">{post.title}</TableCell>
                        <TableCell>
                          <Badge variant={post.status === 'approved' ? 'default' : 'secondary'}>
                            {post.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(post.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {post.status === 'pending' && (
                              <Button 
                                size="sm" 
                                onClick={() => updatePostStatus(post.id, 'approved')}
                              >
                                Approve
                              </Button>
                            )}
                            {post.status === 'approved' && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => updatePostStatus(post.id, 'pending')}
                              >
                                Unapprove
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => deletePost(post.id)}
                            >
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

          <TabsContent value="stories">
            <StoryManagement />
          </TabsContent>

          <TabsContent value="vip">
            <VIPManager />
          </TabsContent>

          <TabsContent value="reports">
            <ReportsTab />
          </TabsContent>

          <TabsContent value="tasks">
            <Card>
              <CardHeader>
                <CardTitle>Tasks Management ({tasks.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Reward</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task: any) => (
                      <TableRow key={task.id}>
                        <TableCell className="max-w-xs truncate">{task.task_name}</TableCell>
                        <TableCell>{task.category}</TableCell>
                        <TableCell>₦{task.reward_amount}</TableCell>
                        <TableCell>
                          <Badge variant={task.status === 'approved' ? 'default' : 'secondary'}>
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {task.status === 'pending_approval' && (
                              <Button 
                                size="sm" 
                                onClick={() => updateTaskStatus(task.id, 'approved')}
                              >
                                Approve
                              </Button>
                            )}
                            {task.status === 'approved' && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => updateTaskStatus(task.id, 'pending_approval')}
                              >
                                Unapprove
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
        </Tabs>
      </div>
    </div>
  );
};

export default AdminPanel;
