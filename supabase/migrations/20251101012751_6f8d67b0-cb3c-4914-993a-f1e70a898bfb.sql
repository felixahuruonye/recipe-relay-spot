-- Add story_settings to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS story_settings JSONB DEFAULT '{"show_to_everyone": true, "show_to_followers": false, "show_only_me": false, "comments_enabled": true, "audience_control": false, "min_age": 13}'::jsonb;

-- Add age field to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS age INTEGER;

-- Add post_count to user_profiles if not exists
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS vip_post_count INTEGER DEFAULT 0;

-- Create withdrawal_requests table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'withdrawal_requests') THEN
    CREATE TABLE withdrawal_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      amount NUMERIC NOT NULL,
      platform_fee NUMERIC NOT NULL DEFAULT 0,
      net_amount NUMERIC NOT NULL,
      account_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
      admin_notes TEXT,
      countdown_end TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '72 hours'),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      processed_at TIMESTAMP WITH TIME ZONE,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Enable RLS
    ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

    -- Create policies
    CREATE POLICY "Users can view their own withdrawal requests"
      ON withdrawal_requests FOR SELECT
      USING (auth.uid() = user_id);

    CREATE POLICY "Users can create their own withdrawal requests"
      ON withdrawal_requests FOR INSERT
      WITH CHECK (auth.uid() = user_id);

    -- Create indexes
    CREATE INDEX idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
    CREATE INDEX idx_withdrawal_requests_status ON withdrawal_requests(status);
  END IF;
END $$;

-- Create or replace function for withdrawal notifications
CREATE OR REPLACE FUNCTION notify_withdrawal_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != NEW.status THEN
    INSERT INTO user_notifications (user_id, title, message, type, notification_category, action_data)
    VALUES (
      NEW.user_id,
      CASE 
        WHEN NEW.status = 'approved' THEN 'Withdrawal Approved ✅'
        WHEN NEW.status = 'paid' THEN 'Payment Sent 💰'
        WHEN NEW.status = 'rejected' THEN 'Withdrawal Rejected ❌'
        ELSE 'Withdrawal Status Updated'
      END,
      CASE 
        WHEN NEW.status = 'approved' THEN format('Your withdrawal of ₦%s has been approved and will be processed soon.', NEW.amount)
        WHEN NEW.status = 'paid' THEN format('₦%s has been sent to your bank account: %s', NEW.net_amount, NEW.bank_name)
        WHEN NEW.status = 'rejected' THEN format('Your withdrawal request was rejected. Reason: %s', COALESCE(NEW.admin_notes, 'Please contact support.'))
        ELSE 'Your withdrawal request status has been updated.'
      END,
      CASE 
        WHEN NEW.status = 'paid' THEN 'success'
        WHEN NEW.status = 'rejected' THEN 'error'
        ELSE 'info'
      END,
      'withdrawal',
      jsonb_build_object(
        'withdrawal_id', NEW.id,
        'amount', NEW.amount,
        'status', NEW.status
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS on_withdrawal_status_change ON withdrawal_requests;
CREATE TRIGGER on_withdrawal_status_change
  AFTER UPDATE ON withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_withdrawal_status_change();