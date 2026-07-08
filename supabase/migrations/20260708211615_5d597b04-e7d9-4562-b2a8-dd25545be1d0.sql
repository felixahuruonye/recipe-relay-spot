
-- =========================================================
-- 1. MARKETPLACE APPROVAL WORKFLOW
-- =========================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- User asked: require approval for ALL existing products
UPDATE public.products SET approval_status = 'pending' WHERE approval_status IS NULL OR approval_status = 'approved';

-- Refresh public read policy: only approved products visible to everyone.
DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Public can view approved products" ON public.products;
CREATE POLICY "Public can view approved products"
  ON public.products FOR SELECT
  USING (approval_status = 'approved');

DROP POLICY IF EXISTS "Owner can view own products" ON public.products;
CREATE POLICY "Owner can view own products"
  ON public.products FOR SELECT
  USING (auth.uid() = seller_user_id);

DROP POLICY IF EXISTS "Admins can view all products" ON public.products;
CREATE POLICY "Admins can view all products"
  ON public.products FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin RPCs
CREATE OR REPLACE FUNCTION public.admin_approve_product(p_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.products
    SET approval_status = 'approved', approved_by = auth.uid(), approved_at = now(), rejection_reason = NULL
    WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_product(p_id TEXT, p_reason TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.products
    SET approval_status = 'rejected', approved_by = auth.uid(), approved_at = now(), rejection_reason = p_reason
    WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_product(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_product(TEXT, TEXT) TO authenticated;

-- =========================================================
-- 2. CHAT SETTINGS SCHEMA
-- =========================================================

-- Per-conversation preferences (per user, per partner)
CREATE TABLE IF NOT EXISTS public.chat_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  partner_id UUID NOT NULL,
  read_receipts_enabled BOOLEAN NOT NULL DEFAULT true,
  typing_indicator_enabled BOOLEAN NOT NULL DEFAULT true,
  muted_until TIMESTAMPTZ,
  disappearing_duration TEXT NOT NULL DEFAULT 'off',
  theme_key TEXT NOT NULL DEFAULT 'default',
  is_archived BOOLEAN NOT NULL DEFAULT false,
  is_restricted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, partner_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_preferences TO authenticated;
GRANT ALL ON public.chat_preferences TO service_role;
ALTER TABLE public.chat_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own chat prefs" ON public.chat_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Blocked users
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL,
  blocked_id UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own blocks" ON public.blocked_users FOR ALL USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);

-- Message delivery preferences (global)
CREATE TABLE IF NOT EXISTS public.message_delivery_prefs (
  user_id UUID PRIMARY KEY,
  friends_of_friends TEXT NOT NULL DEFAULT 'chats',
  group_members TEXT NOT NULL DEFAULT 'chats',
  page_followers TEXT NOT NULL DEFAULT 'requests',
  others TEXT NOT NULL DEFAULT 'requests',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_delivery_prefs TO authenticated;
GRANT ALL ON public.message_delivery_prefs TO service_role;
ALTER TABLE public.message_delivery_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own delivery prefs" ON public.message_delivery_prefs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Global messaging settings
CREATE TABLE IF NOT EXISTS public.user_messaging_settings (
  user_id UUID PRIMARY KEY,
  active_status_visible BOOLEAN NOT NULL DEFAULT true,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  global_read_receipts BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_messaging_settings TO authenticated;
GRANT ALL ON public.user_messaging_settings TO service_role;
ALTER TABLE public.user_messaging_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own messaging settings" ON public.user_messaging_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
