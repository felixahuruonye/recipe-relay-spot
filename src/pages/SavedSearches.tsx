import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

const SavedSearches = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [savedSearches, setSavedSearches] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadSavedSearches();
    }
  }, [user]);

  const loadSavedSearches = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setSavedSearches(data);
  };

  const deleteSavedSearch = async (id: string) => {
    if (!user) return;
    await supabase.from('saved_searches').delete().eq('id', id);
    loadSavedSearches();
    toast({ title: 'Search Deleted', description: 'Removed from your saved searches' });
  };

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Saved Searches</CardTitle>
        </CardHeader>
        <CardContent>
          {savedSearches.length > 0 ? (
            <div className="space-y-2">
              {savedSearches.map((search) => (
                <div key={search.id} className="flex items-center justify-between p-2 rounded hover:bg-muted">
                  <Link to={`/?q=${encodeURIComponent(search.query)}`}>{search.query}</Link>
                  <Button size="icon" variant="ghost" onClick={() => deleteSavedSearch(search.id)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">You have no saved searches.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SavedSearches;
