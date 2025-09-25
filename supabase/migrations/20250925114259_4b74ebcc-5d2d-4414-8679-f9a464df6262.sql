-- Create Posts table
CREATE TABLE public.posts (
  id TEXT PRIMARY KEY DEFAULT ('post-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4))),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'General',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'deleted')),
  boosted BOOLEAN DEFAULT false,
  boost_until TIMESTAMP WITH TIME ZONE,
  featured_rank INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  reports_count INTEGER DEFAULT 0
);

-- Create Comments table
CREATE TABLE public.comments (
  id TEXT PRIMARY KEY DEFAULT ('comment-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4))),
  post_id TEXT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden'))
);

-- Create Messages table for chat
CREATE TABLE public.messages (
  id TEXT PRIMARY KEY DEFAULT ('msg-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4))),
  channel TEXT NOT NULL DEFAULT 'global',
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  media_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  delivered BOOLEAN DEFAULT false
);

-- Create Products table for marketplace
CREATE TABLE public.products (
  id TEXT PRIMARY KEY DEFAULT ('prod-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4))),
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_ngn DECIMAL(10,2) NOT NULL,
  stock INTEGER DEFAULT 0,
  delivery_options TEXT,
  images TEXT[] DEFAULT '{}',
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  seller_contact TEXT
);

-- Create Transactions table
CREATE TABLE public.transactions (
  id TEXT PRIMARY KEY DEFAULT ('txn-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4))),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('vip', 'boost', 'product', 'ebook', 'challenge-entry')),
  amount_ngn DECIMAL(10,2) NOT NULL,
  paystack_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create Orders table
CREATE TABLE public.orders (
  id TEXT PRIMARY KEY DEFAULT ('order-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4))),
  txn_id TEXT REFERENCES public.transactions(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  amount_ngn DECIMAL(10,2) NOT NULL,
  shipping_address TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create Challenges table
CREATE TABLE public.challenges (
  id TEXT PRIMARY KEY DEFAULT ('challenge-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4))),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  entry_fee_ngn DECIMAL(10,2) DEFAULT 0,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  entries_count INTEGER DEFAULT 0,
  winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create Moderation/Reports table
CREATE TABLE public.reports (
  id TEXT PRIMARY KEY DEFAULT ('report-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4))),
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome TEXT
);

-- Update existing users table with SaveMore Community fields
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vip BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vip_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS analytics_last_seen TIMESTAMP WITH TIME ZONE;

-- Enable RLS on all tables
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Posts
CREATE POLICY "Users can view approved posts" ON public.posts
  FOR SELECT USING (status = 'approved' OR user_id = auth.uid());

CREATE POLICY "Users can create posts" ON public.posts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own posts" ON public.posts
  FOR UPDATE USING (user_id = auth.uid());

-- RLS Policies for Comments
CREATE POLICY "Users can view visible comments" ON public.comments
  FOR SELECT USING (status = 'visible');

CREATE POLICY "Users can create comments" ON public.comments
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own comments" ON public.comments
  FOR UPDATE USING (user_id = auth.uid());

-- RLS Policies for Messages
CREATE POLICY "Users can view their messages" ON public.messages
  FOR SELECT USING (
    from_user_id = auth.uid() OR 
    to_user_id = auth.uid() OR 
    (channel = 'global' AND to_user_id IS NULL)
  );

CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT WITH CHECK (from_user_id = auth.uid());

-- RLS Policies for Products
CREATE POLICY "Users can view active products" ON public.products
  FOR SELECT USING (status = 'active');

CREATE POLICY "Users can create products" ON public.products
  FOR INSERT WITH CHECK (seller_user_id = auth.uid());

CREATE POLICY "Users can update their own products" ON public.products
  FOR UPDATE USING (seller_user_id = auth.uid());

-- RLS Policies for Transactions
CREATE POLICY "Users can view their own transactions" ON public.transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create transactions" ON public.transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for Orders
CREATE POLICY "Users can view their own orders" ON public.orders
  FOR SELECT USING (buyer_user_id = auth.uid() OR seller_user_id = auth.uid());

-- RLS Policies for Reports
CREATE POLICY "Users can create reports" ON public.reports
  FOR INSERT WITH CHECK (reporter_user_id = auth.uid());

CREATE POLICY "Users can view their own reports" ON public.reports
  FOR SELECT USING (reporter_user_id = auth.uid());

-- Enable realtime for posts and comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;