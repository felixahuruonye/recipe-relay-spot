import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import CommunityInsight from './CommunityInsight';

interface FlowaIrProps {
  summary: string;
  recommendations: any[];
  trending: any[];
  newTopic?: {
    title: string;
    category: string;
  };
}

const FlowaIr: React.FC<FlowaIrProps> = ({ summary, recommendations, trending, newTopic }) => {
  const navigate = useNavigate();
  const [generatedContent, setGeneratedContent] = useState('');

  const generateContent = async (type: 'name' | 'title' | 'content') => {
    const { data } = await supabase.functions.invoke('flowair-generate', {
      body: { type, recommendations },
    });
    if (data) {
      setGeneratedContent(data.content);
    }
  };

  const handleCreatePost = () => {
    navigate(
      `/?create=true&title=${encodeURIComponent(
        newTopic.title
      )}&category=${encodeURIComponent(newTopic.category)}`
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>FlowaIr Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold">Summary</h4>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>
        <div>
          <h4 className="font-semibold">You may also like</h4>
          {/* Recommendations will go here */}
          <div className="flex gap-2 mt-2">
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
        <div>
          <h4 className="font-semibold">People are also searching for...</h4>
          {/* Trending searches will go here */}
        </div>
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
        {recommendations.length > 0 && <CommunityInsight recommendations={recommendations} />}
      </CardContent>
    </Card>
  );
};

export default FlowaIr;
