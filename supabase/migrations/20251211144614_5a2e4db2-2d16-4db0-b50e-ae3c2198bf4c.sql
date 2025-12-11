-- Add remaining tables and settings

-- Create admin_settings table for configurable URLs and features
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value text,
  setting_type text DEFAULT 'text',
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage admin_settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Everyone can view admin_settings" ON public.admin_settings;

CREATE POLICY "Admins can manage admin_settings" ON public.admin_settings
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can view admin_settings" ON public.admin_settings
  FOR SELECT USING (true);

-- Insert default settings
INSERT INTO public.admin_settings (setting_key, setting_value, setting_type, description) VALUES
  ('vip_30_days_url', '', 'url', 'Payment URL for 30 days VIP subscription'),
  ('vip_60_days_url', '', 'url', 'Payment URL for 60 days VIP subscription'),
  ('vip_bonus_enabled', 'false', 'boolean', 'Enable star bonus for VIP subscriptions'),
  ('star_purchase_url_default', '', 'url', 'Default Star purchase URL')
ON CONFLICT (setting_key) DO NOTHING;

-- Create star_packages table for admin-configurable star prices with purchase URLs
CREATE TABLE IF NOT EXISTS public.star_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stars integer NOT NULL,
  price_naira numeric NOT NULL,
  notes text,
  purchase_url text,
  status text DEFAULT 'enabled',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.star_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view star packages" ON public.star_packages;
DROP POLICY IF EXISTS "Admins can manage star packages" ON public.star_packages;

CREATE POLICY "Everyone can view star packages" ON public.star_packages
  FOR SELECT USING (status = 'enabled');

CREATE POLICY "Admins can manage star packages" ON public.star_packages
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Clear existing and insert the new star pricing structure
DELETE FROM public.star_packages;
INSERT INTO public.star_packages (stars, price_naira, notes) VALUES
  (10, 3000, 'Entry pack'),
  (20, 5500, 'Affordable mid-tier'),
  (30, 8000, 'Mid-tier'),
  (40, 10500, 'Popular pack'),
  (50, 13000, 'Big enough for regular users'),
  (100, 25000, 'Active users'),
  (200, 48000, 'Medium power users'),
  (300, 70000, 'Frequent spenders'),
  (400, 90000, 'High spender pack'),
  (500, 110000, 'Heavy users'),
  (1000, 210000, 'Serious power users'),
  (2000, 400000, 'Heavy engagement'),
  (3000, 580000, 'Large content use'),
  (4000, 750000, 'High-level engagement'),
  (5000, 900000, 'Top tier pack'),
  (10000, 1750000, 'VIP / advertiser pack'),
  (20000, 3400000, 'Small business use'),
  (30000, 5000000, 'Big creators/ads'),
  (40000, 6500000, 'Elite tier'),
  (50000, 8000000, 'Very elite'),
  (100000, 15000000, 'Extremely high usage'),
  (200000, 28000000, 'Large-scale advertisers'),
  (300000, 42000000, 'Enterprise level'),
  (400000, 55000000, 'Top advertisers'),
  (500000, 68000000, 'Ultra top users'),
  (1000000, 135000000, 'Mega users'),
  (2000000, 270000000, 'Massive spenders'),
  (3000000, 400000000, 'Platform whales'),
  (4000000, 530000000, 'Elite whales'),
  (5000000, 660000000, 'Ultra elite'),
  (10000000, 1300000000, 'Rare mega pack');

-- Add vip_days column to user_profiles to track VIP duration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'vip_days') THEN
    ALTER TABLE public.user_profiles ADD COLUMN vip_days integer DEFAULT 0;
  END IF;
END $$;

-- Create general_messages table for admin to send broadcast messages
CREATE TABLE IF NOT EXISTS public.general_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.general_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view general messages" ON public.general_messages;
DROP POLICY IF EXISTS "Admins can manage general messages" ON public.general_messages;

CREATE POLICY "Everyone can view general messages" ON public.general_messages
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage general messages" ON public.general_messages
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Send notification about earning changes to all users
INSERT INTO public.user_notifications (user_id, title, message, type, notification_category)
SELECT id, 
  '📢 Important: Earning Split Updated!',
  'Great news! Viewer earnings increased from 20% to 35%! Creator earnings: 40%, Viewer cashback: 35%, Platform: 25%. Earn more by watching content!',
  'info',
  'system'
FROM public.user_profiles;