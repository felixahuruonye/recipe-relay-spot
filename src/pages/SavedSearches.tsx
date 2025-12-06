import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Search, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

const SavedSearches = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [savedSearches, setSavedSearches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadSavedSearches();
    }
  }, [user]);

  const loadSavedSearches = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setSavedSearches(data);
    setLoading(false);
  };

  const deleteSavedSearch = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    await supabase.from('saved_searches').delete().eq('id', id);
    loadSavedSearches();
    toast({ title: 'Search Deleted', description: 'Removed from your saved searches' });
  };

  const handleSearchClick = (query: string) => {
    // Navigate to feed with the search query pre-filled
    navigate(`/feed?search=${encodeURIComponent(query)}`);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <CardTitle>Saved Searches</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : savedSearches.length > 0 ? (
            <div className="space-y-2">
              {savedSearches.map((search) => (
                <div 
                  key={search.id} 
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted cursor-pointer transition-colors border"
                  onClick={() => handleSearchClick(search.query)}
                >
                  <div className="flex items-center gap-3">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{search.query}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(search.created_at).toLocaleDateString()}
                    </span>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8"
                      onClick={(e) => deleteSavedSearch(search.id, e)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">You have no saved searches.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Save your searches to quickly access them later.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => navigate('/feed')}>
                Start Searching
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SavedSearches;