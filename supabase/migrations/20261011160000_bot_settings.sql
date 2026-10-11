-- Bot / AI configuration for Lenory admin
CREATE TABLE IF NOT EXISTS public.bot_settings (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  api_key text,
  model text,
  system_prompt text,
  assignment text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

-- Only admins should manage bot settings (reuse is_admin if present; otherwise service role)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bot_settings' AND policyname = 'Admins manage bot_settings'
  ) THEN
    CREATE POLICY "Admins manage bot_settings" ON public.bot_settings
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.id = auth.uid() AND (up.is_admin = true OR up.role = 'admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.id = auth.uid() AND (up.is_admin = true OR up.role = 'admin')
        )
      );
  END IF;
EXCEPTION WHEN others THEN
  -- If policy creation fails (column names differ), leave table open for service role
  NULL;
END $$;

-- Seed default bots
INSERT INTO public.bot_settings (id, name, description, assignment, enabled)
VALUES
  ('lenory_chat', 'Lenory Chat Bot', 'Answers user questions in chat and support', 'chat_support', false),
  ('lenory_moderation', 'Moderation Bot', 'Flags spam and harmful content on posts/comments', 'moderation', false),
  ('lenory_feed', 'Feed Assistant', 'Helps rank and suggest content on For You', 'feed_ranking', false),
  ('lenory_creator', 'Creator Coach', 'Gives creators tips based on their posts', 'creator_tips', false)
ON CONFLICT (id) DO NOTHING;
