import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import CommunityInsight from './CommunityInsight';

interface FlowaIrProps {
  summary?: string;
  recommendations?: any[];
  trending?: any[];
  newTopic?: {
    title: string;
    category: string;
  };
  response?: string;
  aiResponse?: string;
  creditsRemaining?: number;
  error?: string;
}

const FlowaIr: React.FC<FlowaIrProps> = ({ 
  summary, 
  recommendations = [], 
  trending = [], 
  newTopic,
  response,
  aiResponse,
  creditsRemaining,
  error 
}) => {
  const navigate = useNavigate();
  const [generatedContent, setGeneratedContent] = useState('');

  const generateContent = async (type: 'name' | 'title' | 'content') => {
    try {
      const { data } = await supabase.functions.invoke('flowair-generate', {
        body: { type, recommendations },
      });
      if (data) {
        setGeneratedContent(data.content || '');
      }
    } catch (err) {
      console.error('Generate content error:', err);
    }
  };

  const handleCreatePost = () => {
    if (!newTopic) return;
    navigate(
      `/?create=true&title=${encodeURIComponent(
        newTopic.title
      )}&category=${encodeURIComponent(newTopic.category)}`
    );
  };

  // Handle error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>FlowaIr</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // Use aiResponse or response as summary if summary is not provided
  const displaySummary = aiResponse || summary || response || 'No summary available';

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="text-2xl">✨</span>
          FlowaIr AI Summary
          {typeof creditsRemaining === 'number' && (
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              {creditsRemaining} credits left
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-background/50 rounded-lg">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{displaySummary}</p>
        </div>
        
        {Array.isArray(recommendations) && recommendations.length > 0 && (
          <div>
            <h4 className="font-semibold">You may also like</h4>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Button size="sm" onClick={() => generateContent('name')}>Generate Name</Button>
              <Button size="sm" onClick={() => generateContent('title')}>Generate Title</Button>
              <Button size="sm" onClick={() => generateContent('content')}>Generate Content</Button>
            </div>
            {generatedContent && (
              <div className="mt-4 p-4 border rounded-md bg-muted">
                <p className="text-sm">{generatedContent}</p>
              </div>
            )}
          </div>
        )}

        {Array.isArray(trending) && trending.length > 0 && (
          <div>
            <h4 className="font-semibold">People are also searching for...</h4>
            <div className="flex flex-wrap gap-2 mt-2">
              {trending.map((item: any, index: number) => (
                <span key={index} className="text-sm text-primary">
                  {typeof item === 'string' ? item : item?.keyword || item?.term}
                </span>
              ))}
            </div>
          </div>
        )}

        {newTopic && (
          <div>
            <h4 className="font-semibold">New Topic Suggestion</h4>
            <p className="text-sm text-muted-foreground">
              We couldn't find anything about "{newTopic.title}" in the {newTopic.category} category.
            </p>
            <Button onClick={handleCreatePost} className="mt-2">
              Create a Post about "{newTopic.title}"
            </Button>
          </div>
        )}

        {Array.isArray(recommendations) && recommendations.length > 0 && (
          <CommunityInsight recommendations={recommendations} />
        )}
      </CardContent>
    </Card>
  );
};

export default FlowaIr;
