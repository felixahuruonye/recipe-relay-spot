import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create anon client to verify caller
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id, self_delete } = await req.json();
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: "target_user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If not self-delete, check admin role
    if (!self_delete || target_user_id !== caller.id) {
      const { data: roleData } = await anonClient
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Use service role client for deletion
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Delete from all user-related tables
    const tables = [
      { table: "post_likes", column: "user_id" },
      { table: "post_comments", column: "user_id" },
      { table: "post_views", column: "user_id" },
      { table: "post_shares", column: "user_id" },
      { table: "post_reports", column: "reporter_user_id" },
      { table: "comment_reactions", column: "user_id" },
      { table: "comment_replies", column: "user_id" },
      { table: "comment_reports", column: "reporter_user_id" },
      { table: "posts", column: "user_id" },
      { table: "private_messages", column: "from_user_id" },
      { table: "private_messages", column: "to_user_id" },
      { table: "group_messages", column: "user_id" },
      { table: "group_members", column: "user_id" },
      { table: "messages", column: "from_user_id" },
      { table: "followers", column: "follower_id" },
      { table: "followers", column: "following_id" },
      { table: "notifications", column: "user_id" },
      { table: "user_notifications", column: "user_id" },
      { table: "user_balances", column: "user_id" },
      { table: "user_bank_details", column: "user_id" },
      { table: "user_checkins", column: "user_id" },
      { table: "user_feedback", column: "user_id" },
      { table: "user_activity_logs", column: "user_id" },
      { table: "user_login_history", column: "user_id" },
      { table: "user_sessions", column: "user_id" },
      { table: "user_reports", column: "reporter_id" },
      { table: "user_reports", column: "reported_user_id" },
      { table: "story_views", column: "viewer_id" },
      { table: "story_transactions", column: "viewer_id" },
      { table: "story_transactions", column: "uploader_id" },
      { table: "storyline_reactions", column: "user_id" },
      { table: "storyline_comments", column: "user_id" },
      { table: "user_storylines", column: "user_id" },
      { table: "sticker_usage", column: "user_id" },
      { table: "balance_history", column: "user_id" },
      { table: "payment_requests", column: "user_id" },
      { table: "payments", column: "user_id" },
      { table: "transactions", column: "user_id" },
      { table: "task_completions", column: "user_id" },
      { table: "task_submissions", column: "user_id" },
      { table: "tasks", column: "user_id" },
      { table: "orders", column: "buyer_user_id" },
      { table: "products", column: "seller_user_id" },
      { table: "referrals", column: "referrer_id" },
      { table: "saved_searches", column: "user_id" },
      { table: "disputes", column: "user_id" },
      { table: "admin_user_messages", column: "user_id" },
      { table: "admin_private_messages", column: "user_id" },
      { table: "admin_questions", column: "user_uuid" },
      { table: "admin_notifications", column: "user_id" },
      { table: "chat_responses", column: "user_id" },
      { table: "hidden_posts", column: "user_id" },
      { table: "live_chat_sessions", column: "user_id" },
      { table: "marketplace_offers", column: "user_id" },
      { table: "music_offers", column: "user_id" },
      { table: "review_requests", column: "user_id" },
      { table: "system_errors", column: "user_id" },
      { table: "telegram_messages", column: "user_id" },
      { table: "user_roles", column: "user_id" },
    ];

    // Delete owned groups (and their messages/members)
    const { data: ownedGroups } = await adminClient
      .from("groups")
      .select("id")
      .eq("owner_id", target_user_id);

    if (ownedGroups && ownedGroups.length > 0) {
      const groupIds = ownedGroups.map((g: any) => g.id);
      await adminClient.from("group_messages").delete().in("group_id", groupIds);
      await adminClient.from("group_members").delete().in("group_id", groupIds);
      await adminClient.from("groups").delete().in("id", groupIds);
    }

    // Delete from all tables
    for (const { table, column } of tables) {
      await adminClient.from(table).delete().eq(column, target_user_id);
    }

    // Delete user profile
    await adminClient.from("user_profiles").delete().eq("id", target_user_id);

    // Delete from Supabase Auth
    const { error: authError } = await adminClient.auth.admin.deleteUser(
      target_user_id
    );
    if (authError) {
      console.error("Auth delete error:", authError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Data deleted but auth removal failed: ${authError.message}`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Delete user error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
