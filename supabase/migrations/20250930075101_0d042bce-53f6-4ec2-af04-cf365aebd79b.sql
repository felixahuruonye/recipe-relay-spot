-- Create comments table (if not exists, enhance existing)
CREATE TABLE IF NOT EXISTS public.post_comments (
  id TEXT PRIMARY KEY DEFAULT (('comment-' || to_char(now(), 'YYYYMMDDHH24MISS')) || '-' || upper(substring(gen_random_uuid()::text, 1, 4))),
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_hidden BOOLEAN DEFAULT false,
  is_edited BOOLEAN DEFAULT false
);

-- Create comment replies table
CREATE TABLE IF NOT EXISTS public.comment_replies (
  id TEXT PRIMARY KEY DEFAULT (('reply-' || to_char(now(), 'YYYYMMDDHH24MISS')) || '-' || upper(substring(gen_random_uuid()::text, 1, 4))),
  comment_id TEXT NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create comment reactions table
CREATE TABLE IF NOT EXISTS public.comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id TEXT NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Create post reports table
CREATE TABLE IF NOT EXISTS public.post_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'pending',
  admin_action TEXT,
  admin_notes TEXT
);

-- Create comment reports table
CREATE TABLE IF NOT EXISTS public.comment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id TEXT NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'pending',
  admin_action TEXT,
  admin_notes TEXT
);

-- Create user storylines table
CREATE TABLE IF NOT EXISTS public.user_storylines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  media_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Create post views tracking table
CREATE TABLE IF NOT EXISTS public.post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Create user suspensions table
CREATE TABLE IF NOT EXISTS public.user_suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  suspension_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  suspended_by UUID,
  suspended_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_storylines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_suspensions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for post_comments
CREATE POLICY "Users can view non-hidden comments" ON public.post_comments
  FOR SELECT USING (NOT is_hidden OR user_id = auth.uid());

CREATE POLICY "Users can create comments" ON public.post_comments
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own comments" ON public.post_comments
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own comments" ON public.post_comments
  FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for comment_replies
CREATE POLICY "Users can view replies" ON public.comment_replies
  FOR SELECT USING (true);

CREATE POLICY "Users can create replies" ON public.comment_replies
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own replies" ON public.comment_replies
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own replies" ON public.comment_replies
  FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for comment_reactions
CREATE POLICY "Users can view comment reactions" ON public.comment_reactions
  FOR SELECT USING (true);

CREATE POLICY "Users can add comment reactions" ON public.comment_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove their own reactions" ON public.comment_reactions
  FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for post_reports
CREATE POLICY "Users can create post reports" ON public.post_reports
  FOR INSERT WITH CHECK (reporter_user_id = auth.uid());

CREATE POLICY "Users can view their own reports" ON public.post_reports
  FOR SELECT USING (reporter_user_id = auth.uid());

-- RLS Policies for comment_reports
CREATE POLICY "Users can create comment reports" ON public.comment_reports
  FOR INSERT WITH CHECK (reporter_user_id = auth.uid());

CREATE POLICY "Users can view their own comment reports" ON public.comment_reports
  FOR SELECT USING (reporter_user_id = auth.uid());

-- RLS Policies for user_storylines
CREATE POLICY "Users can view all storylines" ON public.user_storylines
  FOR SELECT USING (expires_at > now());

CREATE POLICY "Users can create their own storylines" ON public.user_storylines
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own storylines" ON public.user_storylines
  FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for post_views
CREATE POLICY "Users can view their own post views" ON public.post_views
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can track their own views" ON public.post_views
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for user_suspensions
CREATE POLICY "Users can view their own suspensions" ON public.user_suspensions
  FOR SELECT USING (user_id = auth.uid());

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user_id ON public.post_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_replies_comment_id ON public.comment_replies(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON public.comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_post_reports_status ON public.post_reports(status);
CREATE INDEX IF NOT EXISTS idx_comment_reports_status ON public.comment_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_storylines_user_id ON public.user_storylines(user_id);
CREATE INDEX IF NOT EXISTS idx_user_storylines_expires_at ON public.user_storylines(expires_at);
CREATE INDEX IF NOT EXISTS idx_post_views_post_id ON public.post_views(post_id);
CREATE INDEX IF NOT EXISTS idx_post_views_user_id ON public.post_views(user_id);
CREATE INDEX IF NOT EXISTS idx_user_suspensions_user_id ON public.user_suspensions(user_id, is_active);