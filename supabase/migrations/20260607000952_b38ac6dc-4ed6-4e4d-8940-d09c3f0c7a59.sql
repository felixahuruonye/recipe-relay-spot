DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_replies;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.comment_replies REPLICA IDENTITY FULL;
ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;