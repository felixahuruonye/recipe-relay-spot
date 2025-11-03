-- Fix Critical Security Issues - Part 2: Update Existing RLS Policies

-- 2. Fix users table RLS policies
-- Drop all existing policies on users table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile during signup" ON public.users;

-- Create restrictive policies for users table
CREATE POLICY "Users can view their own profile"
  ON public.users FOR SELECT
  USING (email = auth.email());

CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  USING (email = auth.email());

CREATE POLICY "Users can insert their own profile"
  ON public.users FOR INSERT
  WITH CHECK (email = auth.email());

CREATE POLICY "Admins can view all user profiles"
  ON public.users FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all user profiles"
  ON public.users FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Fix withdrawal_history RLS policies
DROP POLICY IF EXISTS "Users can view their own withdrawal history" ON public.withdrawal_history;

CREATE POLICY "Users can view their own withdrawal history"
  ON public.withdrawal_history FOR SELECT
  USING (user_uuid = auth.uid());

CREATE POLICY "Admins can view all withdrawal history"
  ON public.withdrawal_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage withdrawal history"
  ON public.withdrawal_history FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Add admin policies to star tables
CREATE POLICY "Admins can manage star market"
  ON public.star_market FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage star rates"
  ON public.star_rates FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));