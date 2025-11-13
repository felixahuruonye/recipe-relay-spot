import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TrendingNowProps {
  onSelect: (keyword: string) => void;
}

const TrendingNow: React.FC<TrendingNowProps> = ({ onSelect }) => {
  const [trending, setTrending] = useState<any[]>([]);

  useEffect(() => {
    loadTrending();
  }, []);

  const loadTrending = async () => {
    const { data } = await supabase
      .from('search_trends')
      .select('*')
      .order('search_count', { ascending: false })
      .limit(5);

    if (data) setTrending(data);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Trending Now</h3>
      <div className="flex flex-wrap gap-2">
        {trending.map((trend) => (
          <Badge
            key={trend.id}
            variant="secondary"
            className="cursor-pointer hover:bg-primary/20"
            onClick={() => onSelect(trend.keyword)}
          >
            <Flame className="w-3 h-3 mr-1" />
            {trend.keyword}
          </Badge>
        ))}
      </div>
    </div>
  );
};

export default TrendingNow;
