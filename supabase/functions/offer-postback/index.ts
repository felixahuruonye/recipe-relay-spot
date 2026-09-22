// S2S postback receiver for LENORY Task System v2
//
// Networks call this URL when a user completes a task. Supports GET or POST.
//
//   https://<project>.functions.supabase.co/offer-postback
//     ?secret=OFFER_POSTBACK_SECRET
//     &click_id={click_uuid}          (from record_task_click_v2 response)
//     &provider=monlix|mylead|cpagrip|ogads
//     &transaction_id={trans_id}      (provider's unique transaction ID, for dedup)
//     &payout={payout_usd}            (USD amount, required)
//     &status=approved|pending|chargeback|rejected (conversion status)
//     &offer_name={offer_name}        (optional)
//
// Postback calls process_task_postback RPC which:
// - Validates the click exists
// - Checks for duplicates (transaction_id)
// - Calculates user reward stars based on admin config
// - Logs fraud flags
// - Updates task_ledger
// - Credits or holds user's star balance

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

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

    // Click ID and provider are required for the new system
    const clickId = params.click_id || params.click_uuid;
    const provider = (params.provider || '').toLowerCase();

    if (!clickId) {
      return new Response(JSON.stringify({ success: false, error: 'missing_click_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!provider) {
      return new Response(JSON.stringify({ success: false, error: 'missing_provider' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payoutUsd = Number(params.payout ?? params.amount ?? 0) || 0;
    const status = (params.status || 'approved').toLowerCase();
    const transactionId = params.transaction_id || params.trans_id || null;
    const offerName = params.offer_name || params.title || null;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Call the new v2 postback processor
    const { data, error } = await admin.rpc('process_task_postback', {
      p_provider_id: provider,
      p_click_id: clickId,
      p_provider_transaction_id: transactionId,
      p_payout_usd: payoutUsd,
      p_status: status,
      p_offer_name: offerName,
    });

    if (error) {
      console.error('process_task_postback failed', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = (data as any) || {};
    // Most networks expect a plain "1"/"OK" body on success.
    const ok = result?.success === true;
    return new Response(ok ? '1' : JSON.stringify(result), {
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
