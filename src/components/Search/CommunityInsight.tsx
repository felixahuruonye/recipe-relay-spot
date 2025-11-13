import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThumbsUp } from 'lucide-react';

interface CommunityInsightProps {
  recommendations: any[];
}

const CommunityInsight: React.FC<CommunityInsightProps> = ({ recommendations }) => {
  const [topComments, setTopComments] = useState<any[]>([]);

  useEffect(() => {
    if (recommendations.length > 0) {
      loadTopComments();
    }
  }, [recommendations]);

  const loadTopComments = async () => {
    const postIds = recommendations.map((r) => r.id);
    const { data } = await supabase
      .from('post_comments')
      .select('*, user_profiles(username, avatar_url)')
      .in('post_id', postIds)
      .order('likes_count', { ascending: false })
      .limit(5);

    if (data) setTopComments(data);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Community Insight</CardTitle>
      </CardHeader>
      <CardContent>
        {topComments.length > 0 ? (
          <div className="space-y-4">
            {topComments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-4">
                <Avatar>
                  <AvatarImage src={comment.user_profiles.avatar_url} />
                  <AvatarFallback>{comment.user_profiles.username.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{comment.user_profiles.username}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ThumbsUp className="w-4 h-4" />
                      <span>{comment.likes_count}</span>
                    </div>
                  </div>
                  <p className="text-sm">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No comments yet.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default CommunityInsight;
