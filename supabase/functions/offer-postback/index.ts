// S2S postback receiver for the Lenory Earn (offerwall) system.
//
// Networks call this URL when a user completes an offer. Supports GET or POST.
//
//   https://<project>.functions.supabase.co/offer-postback
//     ?secret=OFFER_POSTBACK_SECRET
//     &user_id={sub_id}
//     &network=MONLIX|OGADS|MYLEAD|MONETAG|CPAGRIP
//     &transaction_id={trans_id}      (used for de-duplication)
//     &payout={payout}                (USD or network currency, optional)
//     &stars={points}                 (Stars to credit, optional)
//     &offer_name={offer_name}
//     &task_id=<lenory offer_tasks uuid>  (optional)
//
// Rewards are credited atomically by the credit_offer_completion RPC, which
// refuses duplicate transaction_ids.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Fallback conversion when a network reports payout in USD instead of stars.
const USD_TO_STARS = 200;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => (params[k.toLowerCase()] = v));

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        for (const [k, v] of Object.entries(body ?? {})) params[k.toLowerCase()] = String(v);
      } catch {
        // non-JSON body -> query params only
      }
    }

    const expected = Deno.env.get('OFFER_POSTBACK_SECRET');
    if (!expected || params.secret !== expected) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = params.user_id || params.sub_id || params.subid || params.aff_sub;
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'missing_user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payoutUsd = Number(params.payout ?? params.amount ?? 0) || 0;
    const stars = Math.round(
      Number(params.stars ?? params.points ?? 0) || payoutUsd * USD_TO_STARS,
    );

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await admin.rpc('credit_offer_completion', {
      p_user_id: userId,
      p_task_id: params.task_id || null,
      p_provider: (params.network || params.provider || 'CUSTOM').toUpperCase(),
      p_task_title: params.offer_name || params.title || 'Sponsored offer',
      p_stars: stars,
      p_naira: Number(params.naira ?? 0) || 0,
      p_transaction_id: params.transaction_id || params.trans_id || null,
    });

    if (error) {
      console.error('credit_offer_completion failed', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Most networks expect a plain "1"/"OK" body on success.
    const ok = (data as any)?.success === true;
    return new Response(ok ? '1' : JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': ok ? 'text/plain' : 'application/json' },
    });
  } catch (e) {
    console.error('offer-postback error', e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
