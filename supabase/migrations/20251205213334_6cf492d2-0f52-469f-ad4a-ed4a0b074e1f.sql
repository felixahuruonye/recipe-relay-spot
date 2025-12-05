
-- =====================================================
-- SECURITY FIX: Comprehensive RLS Policy Update
-- =====================================================

-- 1. Fix admin_commands - restrict to admins only
DROP POLICY IF EXISTS "Allow admin commands" ON admin_commands;
DROP POLICY IF EXISTS "Enable all for admin commands" ON admin_commands;
CREATE POLICY "Only admins can manage admin_commands" ON admin_commands
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 2. Fix admin_notifications - restrict to admins only  
DROP POLICY IF EXISTS "Allow admin notifications" ON admin_notifications;
DROP POLICY IF EXISTS "Enable all for admin notifications" ON admin_notifications;
CREATE POLICY "Only admins can manage admin_notifications" ON admin_notifications
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 3. Fix admin_private_messages - admins can manage, users can view their own
DROP POLICY IF EXISTS "Admins can manage messages" ON admin_private_messages;
DROP POLICY IF EXISTS "Users can view their messages" ON admin_private_messages;
DROP POLICY IF EXISTS "Enable all for admin_private_messages" ON admin_private_messages;

CREATE POLICY "Admins can manage admin_private_messages" ON admin_private_messages
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own admin messages" ON admin_private_messages
FOR SELECT USING (user_id = auth.uid());

-- 4. Fix admin_questions - users can insert their own, admins can manage all
DROP POLICY IF EXISTS "Allow admin questions" ON admin_questions;
DROP POLICY IF EXISTS "Enable all for admin questions" ON admin_questions;

CREATE POLICY "Users can insert their own questions" ON admin_questions
FOR INSERT WITH CHECK (user_uuid = auth.uid());

CREATE POLICY "Users can view their own questions" ON admin_questions
FOR SELECT USING (user_uuid = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all questions" ON admin_questions
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 5. Fix admin_user_messages - admins manage, users view own
DROP POLICY IF EXISTS "Admins can manage messages" ON admin_user_messages;
DROP POLICY IF EXISTS "Users can view their messages" ON admin_user_messages;
DROP POLICY IF EXISTS "Enable all for admin_user_messages" ON admin_user_messages;

CREATE POLICY "Admins can manage admin_user_messages" ON admin_user_messages
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own admin_user_messages" ON admin_user_messages
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own messages" ON admin_user_messages
FOR INSERT WITH CHECK (user_id = auth.uid() AND is_from_admin = false);

-- 6. Fix payment_requests - users manage own, admins manage all
DROP POLICY IF EXISTS "Users can manage their payment requests" ON payment_requests;
DROP POLICY IF EXISTS "Admins can manage payment requests" ON payment_requests;
DROP POLICY IF EXISTS "Enable all for payment_requests" ON payment_requests;

CREATE POLICY "Users can view their payment requests" ON payment_requests
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their payment requests" ON payment_requests
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all payment_requests" ON payment_requests
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 7. Fix payments - users view own, admins manage all
DROP POLICY IF EXISTS "Allow payments access" ON payments;
DROP POLICY IF EXISTS "Enable all for payments" ON payments;

CREATE POLICY "Users can view their own payments" ON payments
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all payments" ON payments
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 8. Fix task_completions - restrict insert, admins manage
DROP POLICY IF EXISTS "System can insert task completions" ON task_completions;
DROP POLICY IF EXISTS "Admins can manage task completions" ON task_completions;
DROP POLICY IF EXISTS "Users can view their task completions" ON task_completions;

CREATE POLICY "Users can view their own task_completions" ON task_completions
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own completions" ON task_completions
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all task_completions" ON task_completions
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 9. Fix user_profiles UPDATE policy to restrict sensitive columns
-- First drop the existing overly permissive update policy
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Create a function to check if only safe columns are being updated
CREATE OR REPLACE FUNCTION public.check_profile_update_allowed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If user is admin, allow all updates
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  
  -- For regular users, prevent changes to sensitive fields
  IF NEW.vip IS DISTINCT FROM OLD.vip OR
     NEW.is_vip IS DISTINCT FROM OLD.is_vip OR
     NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at OR
     NEW.vip_started_at IS DISTINCT FROM OLD.vip_started_at OR
     NEW.star_balance IS DISTINCT FROM OLD.star_balance OR
     NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance OR
     NEW.ai_credits IS DISTINCT FROM OLD.ai_credits OR
     NEW.voice_credits IS DISTINCT FROM OLD.voice_credits OR
     NEW.total_earned IS DISTINCT FROM OLD.total_earned OR
     NEW.is_suspended IS DISTINCT FROM OLD.is_suspended OR
     NEW.suspended_at IS DISTINCT FROM OLD.suspended_at OR
     NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
    RAISE EXCEPTION 'You cannot modify protected profile fields';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger for profile updates
DROP TRIGGER IF EXISTS enforce_profile_update_restrictions ON user_profiles;
CREATE TRIGGER enforce_profile_update_restrictions
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_profile_update_allowed();

-- Recreate the update policy (basic ownership check, trigger handles field restrictions)
CREATE POLICY "Users can update their own profile" ON user_profiles
FOR UPDATE USING (id = auth.uid());

-- 10. Fix tasks table - users create own, admins manage all
DROP POLICY IF EXISTS "Users can create tasks" ON tasks;
DROP POLICY IF EXISTS "Anyone can view tasks" ON tasks;
DROP POLICY IF EXISTS "Enable insert for tasks" ON tasks;
DROP POLICY IF EXISTS "Enable select for tasks" ON tasks;

CREATE POLICY "Users can create their own tasks" ON tasks
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view approved tasks" ON tasks
FOR SELECT USING (status = 'approved' OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own pending tasks" ON tasks
FOR UPDATE USING (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "Admins can manage all tasks" ON tasks
FOR ALL USING (public.has_role(auth.uid(), 'admin'));
