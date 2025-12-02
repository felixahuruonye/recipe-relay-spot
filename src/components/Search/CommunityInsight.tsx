import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThumbsUp } from 'lucide-react';

interface CommunityInsightProps {
  recommendations?: any[];
}

const CommunityInsight: React.FC<CommunityInsightProps> = ({ recommendations = [] }) => {
  const [topComments, setTopComments] = useState<any[]>([]);

  useEffect(() => {
    if (Array.isArray(recommendations) && recommendations.length > 0) {
      loadTopComments();
    }
  }, [recommendations]);

  const loadTopComments = async () => {
    if (!Array.isArray(recommendations) || recommendations.length === 0) return;
    
    const postIds = recommendations
      .filter((r) => r?.id)
      .map((r) => r.id);
    
    if (postIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('post_comments')
        .select('*, user_profiles(username, avatar_url)')
        .in('post_id', postIds)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error loading comments:', error);
        return;
      }

      if (data) setTopComments(data);
    } catch (err) {
      console.error('Error in loadTopComments:', err);
    }
  };

  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Community Insight</CardTitle>
      </CardHeader>
      <CardContent>
        {topComments.length > 0 ? (
          <div className="space-y-4">
            {topComments.map((comment) => {
              const userProfile = comment?.user_profiles;
              const username = userProfile?.username || 'Anonymous';
              const avatarUrl = userProfile?.avatar_url;
              
              return (
                <div key={comment.id} className="flex items-start gap-4">
                  <Avatar>
                    <AvatarImage src={avatarUrl} />
                    <AvatarFallback>{username.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{username}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ThumbsUp className="w-4 h-4" />
                        <span>{comment.likes_count || 0}</span>
                      </div>
                    </div>
                    <p className="text-sm">{comment.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground">No comments yet.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default CommunityInsight;
