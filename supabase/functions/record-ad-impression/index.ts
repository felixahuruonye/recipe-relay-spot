// Record an AdSterra ad impression and credit the user 1 Silver Star
// (for placement === 'fullscreen_silver'). Future placements (feed_video,
// story, etc.) can be wired into the same endpoint by passing a different
// `placement` value — the table already stores it.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// AdSterra payouts (NGN). Keep server-side so client can't inflate.
const PAYOUT_NGN: Record<string, number> = {
  fullscreen_silver: 1.5, // ₦1.50 -> 1 Silver Star credited
  feed_video: 2.25,       // reserved for future slice
  story: 2.25,            // reserved for future slice
};

const SILVER_PER_AD: Record<string, number> = {
  fullscreen_silver: 1,
  feed_video: 0,
  story: 0,
};

// Simple anti-abuse: max N counted impressions per user per minute
const RATE_WINDOW_SEC = 60;
const RATE_MAX = 4;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } =
      await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const placement = String(body?.placement ?? 'fullscreen_silver');
    const network = String(body?.network ?? 'adsterra');

    if (!(placement in PAYOUT_NGN)) {
      return json({ error: 'Invalid placement' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Rate limit
    const since = new Date(Date.now() - RATE_WINDOW_SEC * 1000).toISOString();
    const { count } = await admin
      .from('ad_impressions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'counted')
      .gte('created_at', since);

    if ((count ?? 0) >= RATE_MAX) {
      // Log as rejected so we have an audit trail.
      await admin.from('ad_impressions').insert({
        user_id: userId,
        network,
        placement,
        ngn_payout: 0,
        silver_credited: 0,
        status: 'rejected',
        ip_address: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent'),
        meta: { reason: 'rate_limit' },
      });
      return json({ error: 'Rate limit, try again shortly', credited: 0 }, 429);
    }

    const payout = PAYOUT_NGN[placement];
    const silver = SILVER_PER_AD[placement];

    // Insert impression
    const { data: imp, error: impErr } = await admin
      .from('ad_impressions')
      .insert({
        user_id: userId,
        network,
        placement,
        ngn_payout: payout,
        silver_credited: silver,
        status: 'counted',
        ip_address: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent'),
        meta: body?.meta ?? {},
      })
      .select('id')
      .single();

    if (impErr) {
      console.error('impression insert error', impErr);
      return json({ error: impErr.message }, 500);
    }

    // Credit silver star balance + transaction row
    if (silver > 0) {
      const { data: prof } = await admin
        .from('user_profiles')
        .select('silver_star_balance')
        .eq('id', userId)
        .maybeSingle();

      const next = (prof?.silver_star_balance ?? 0) + silver;
      await admin
        .from('user_profiles')
        .update({ silver_star_balance: next })
        .eq('id', userId);

      await admin.from('silver_star_transactions').insert({
        user_id: userId,
        tx_type: 'credit',
        amount_stars: silver,
        pool_ngn: payout,
        platform_amount_ngn: payout, // platform holds until tipped
        ad_impression_id: imp.id,
        meta: { source: network, placement },
      });
    }

    return json({ ok: true, credited: silver, impression_id: imp.id });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
