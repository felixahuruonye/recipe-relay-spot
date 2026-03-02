
-- Marketplace delivery orders table
CREATE TABLE IF NOT EXISTS public.marketplace_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id text REFERENCES public.orders(id),
  product_id text NOT NULL,
  seller_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  delivery_method text NOT NULL DEFAULT 'self', -- 'self' or 'savemore'
  status text NOT NULL DEFAULT 'pending', -- pending, pickup_scheduled, on_the_way, delivered
  
  -- Customer info (filled by admin)
  customer_name text,
  customer_location text,
  customer_address text,
  customer_phone text,
  customer_email text,
  delivery_date text,
  amount_paid numeric DEFAULT 0,
  amount_charged numeric DEFAULT 0,
  
  -- Seller delivery info
  seller_name text,
  seller_location text,
  seller_address text,
  seller_whatsapp text,
  seller_email text,
  seller_website text,
  seller_note text,
  offers_refund boolean DEFAULT false,
  invoice_url text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view their deliveries"
ON public.marketplace_deliveries FOR SELECT
USING (seller_id = auth.uid() OR buyer_id = auth.uid());

CREATE POLICY "Sellers can insert deliveries"
ON public.marketplace_deliveries FOR INSERT
WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Sellers can update their deliveries"
ON public.marketplace_deliveries FOR UPDATE
USING (seller_id = auth.uid());

CREATE POLICY "Admins can manage all deliveries"
ON public.marketplace_deliveries FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Product reviews table
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id text NOT NULL,
  user_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reviews"
ON public.product_reviews FOR SELECT
USING (true);

CREATE POLICY "Users can add reviews"
ON public.product_reviews FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own reviews"
ON public.product_reviews FOR DELETE
USING (user_id = auth.uid());

-- RPC to deduct stars for delivery/invoice (bypasses profile protection)
CREATE OR REPLACE FUNCTION public.deduct_stars_for_service(p_user_id uuid, p_amount integer, p_description text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  SET LOCAL app.bypass_profile_protection = 'true';
  
  SELECT star_balance INTO v_balance FROM user_profiles WHERE id = p_user_id;
  
  IF COALESCE(v_balance, 0) < p_amount THEN
    RETURN false;
  END IF;
  
  UPDATE user_profiles SET star_balance = COALESCE(star_balance, 0) - p_amount WHERE id = p_user_id;
  
  INSERT INTO user_notifications (user_id, title, message, type, notification_category)
  VALUES (p_user_id, 'Stars Deducted', p_amount || ' Stars deducted: ' || p_description, 'system', 'billing');
  
  RETURN true;
END;
$$;
