-- Create hidden_posts table for "Remove from Feed" functionality
CREATE TABLE IF NOT EXISTS public.hidden_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  hidden_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, post_id)
);

-- Enable RLS
ALTER TABLE public.hidden_posts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own hidden posts"
  ON public.hidden_posts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX idx_hidden_posts_user_id ON public.hidden_posts(user_id);
CREATE INDEX idx_hidden_posts_post_id ON public.hidden_posts(post_id);