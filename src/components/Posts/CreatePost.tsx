import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, Plus, X, Image, Video } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CreatePostProps {
  onPostCreated?: () => void;
  postToEdit?: any;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

const CreatePost: React.FC<CreatePostProps> = ({
  onPostCreated,
  postToEdit,
  isOpen,
  onOpenChange
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [editPostId, setEditPostId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (postToEdit) {
      setTitle(postToEdit.title);
      setBody(postToEdit.body);
      setCategory(postToEdit.category);
      setEditPostId(postToEdit.id);
      setMediaPreviews(postToEdit.media_urls || []);
    } else {
      // Reset form when there's no post to edit
      setTitle('');
      setBody('');
      setCategory('');
      setEditPostId(null);
      setMediaPreviews([]);
      setMediaFiles([]);
    }
  }, [postToEdit]);

  const categories = [
    'Jollof Rice', 'Desserts', 'Equipment', 'For Sale', 'Tips & Tricks',
    'Restaurant Reviews', 'Recipes', 'Cooking Videos', 'General Discussion'
  ];

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const maxSize = file.type.startsWith('video/') ? 500 * 1024 * 1024 : 20 * 1024 * 1024; // 500MB for videos, 20MB for images
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: `${file.name} is larger than ${file.type.startsWith('video/') ? '500MB' : '20MB'}`,
          variant: "destructive"
        });
        return false;
      }
      return file.type.startsWith('image/') || file.type.startsWith('video/');
    });

    if (validFiles.length + mediaFiles.length > 3) {
      toast({
        title: "Too many files",
        description: "You can only upload up to 3 media files per post",
        variant: "destructive"
      });
      return;
    }

    setMediaFiles(prev => [...prev, ...validFiles]);
    
    // Create previews
    validFiles.forEach(file => {
      const previewUrl = URL.createObjectURL(file);
      setMediaPreviews(prev => [...prev, previewUrl]);
    });
  };

  const removeMedia = (index: number) => {
    URL.revokeObjectURL(mediaPreviews[index]);
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const uploadMedia = async (): Promise<string[]> => {
    if (!mediaFiles.length || !user) return [];

    const uploadPromises = mediaFiles.map(async (file, index) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}-${index}.${fileExt}`;

      const { error } = await supabase.storage
        .from('post-media')
        .upload(fileName, file);

      if (error) {
        console.error('Media upload error:', error);
        return null;
      }

      const { data } = supabase.storage
        .from('post-media')
        .getPublicUrl(fileName);

      return data.publicUrl;
    });

    const results = await Promise.all(uploadPromises);
    return results.filter((url): url is string => url !== null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !title.trim() || !body.trim() || !category) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      let mediaUrls: string[] = [];
      
      // Upload new media if any
      if (mediaFiles.length > 0) {
        mediaUrls = await uploadMedia();
      } else if (editPostId) {
        // Keep existing media URLs if editing
        mediaUrls = mediaPreviews;
      }

      if (editPostId) {
        // Update existing post
        const { error } = await supabase
          .from('posts')
          .update({
            title: title.trim(),
            body: body.trim(),
            category,
            media_urls: mediaUrls
          })
          .eq('id', editPostId);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Post updated successfully!"
        });
      } else {
        // Create new post
        const { error } = await supabase.from('posts').insert({
          title: title.trim(),
          body: body.trim(),
          category,
          media_urls: mediaUrls,
          user_id: user.id,
          status: 'approved'
        });

        if (error) throw error;

        toast({
          title: "Success",
          description: "Post created successfully!"
        });
      }

      // Reset form
      setTitle('');
      setBody('');
      setCategory('');
      setMediaFiles([]);
      setMediaPreviews([]);
      setEditPostId(null);
      if (onOpenChange) onOpenChange(false);
      
      if (onPostCreated) {
        onPostCreated();
      }
    } catch (error) {
      console.error('Error submitting post:', error);
      toast({
        title: "Error",
        description: "Failed to submit post. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {!postToEdit && (
        <DialogTrigger asChild>
          <Button className="w-full" size="lg">
            <Plus className="w-4 h-4 mr-2" />
            Create Post
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editPostId ? 'Edit Post' : 'Create New Post'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="What's your post about?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={100}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select value={category} onValueChange={setCategory} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="body">Content *</Label>
            <Textarea
              id="body"
              placeholder="Share your thoughts, recipe, or ask a question..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              minLength={10}
              maxLength={2000}
              rows={6}
            />
            <div className="text-xs text-muted-foreground text-right">
              {body.length}/2000 characters
            </div>
          </div>

          {/* Media Upload */}
          <div className="space-y-2">
            <Label>Media (Optional)</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-4">
              <div className="flex flex-col items-center justify-center space-y-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <label className="cursor-pointer">
                  <span className="text-sm font-medium text-primary hover:underline">
                    Upload images or videos
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={handleMediaChange}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  Max 3 files. Images: 20MB, Videos: 500MB (up to 3 hours)
                </p>
              </div>
            </div>

            {/* Media Previews */}
            {mediaPreviews.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-4">
                {mediaPreviews.map((preview, index) => (
                  <div key={index} className="relative">
                    {mediaFiles[index]?.type.startsWith('image/') ? (
                      <img 
                        src={preview} 
                        alt={`Preview ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ) : (
                      <video 
                        src={preview} 
                        className="w-full h-32 object-cover rounded-lg"
                        muted
                      />
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 h-6 w-6 p-0"
                      onClick={() => removeMedia(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <div className="absolute bottom-2 left-2">
                      {mediaFiles[index]?.type.startsWith('image/') ? (
                        <Image className="w-4 h-4 text-white" />
                      ) : (
                        <Video className="w-4 h-4 text-white" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange && onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !title.trim() || !body.trim() || !category}
            >
              {loading ? (editPostId ? "Updating..." : "Creating...") : (editPostId ? "Update Post" : "Create Post")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePost;