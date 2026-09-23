// register-device: the ONLY way a device fingerprint gets written to
// user_devices. There is no client-callable RPC for this anymore — the
// table has no INSERT/UPDATE policy for authenticated users, so writes
// only happen here, using the service role key, after we've verified
// the caller's identity from their own auth token (never trusted from
// the request body).
//
// Body: { hash, userAgent, platform, screenResolution, timezone,
//         language, hardwareConcurrency, deviceMemory, touchSupport }
// (all produced by src/lib/deviceFingerprint.ts — never user-editable
// free text beyond what the browser itself reports)
//
// Fraud logic: if this exact device hash is already on file for a
// DIFFERENT user, the account making *this* request gets
// earning_restricted = true. The earlier account is left untouched —
// per spec, we never punish the original owner of a shared device.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const deviceHash = String(body?.hash ?? '').trim();
    if (!deviceHash || deviceHash.length < 16) {
      return json({ error: 'Invalid device fingerprint' }, 400);
    }

    const userAgent = String(body?.userAgent ?? '').slice(0, 500);
    const platform = String(body?.platform ?? '').slice(0, 200);
    const screenResolution = String(body?.screenResolution ?? '').slice(0, 50);
    const timezone = String(body?.timezone ?? '').slice(0, 100);
    const language = String(body?.language ?? '').slice(0, 20);
    const hardwareConcurrency = Number.isFinite(body?.hardwareConcurrency)
      ? Number(body.hardwareConcurrency)
      : null;
    const deviceMemory = Number.isFinite(body?.deviceMemory) ? Number(body.deviceMemory) : null;
    const touchSupport = Boolean(body?.touchSupport);

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Is this exact device already tied to a different account?
    const { data: existingRows } = await admin
      .from('user_devices')
      .select('user_id')
      .eq('device_id', deviceHash)
      .neq('user_id', userId)
      .limit(1);

    const linkedToOtherAccount = !!existingRows && existingRows.length > 0;

    // Upsert this user's device row (one row per user+device; repeat
    // visits just refresh last_seen and the raw signals).
    const { data: deviceRow, error: upsertErr } = await admin
      .from('user_devices')
      .upsert(
        {
          user_id: userId,
          device_id: deviceHash,
          user_agent: userAgent,
          platform,
          screen_resolution: screenResolution,
          timezone,
          language,
          hardware_concurrency: hardwareConcurrency,
          device_memory: deviceMemory,
          touch_support: touchSupport,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id' },
      )
      .select('*')
      .single();

    if (upsertErr) {
      console.error('device upsert error', upsertErr);
      return json({ error: upsertErr.message }, 500);
    }

    // Mark consent + (if applicable) restrict earning on THIS account.
    const profileUpdate: Record<string, unknown> = { device_tracking_consented: true };
    if (linkedToOtherAccount) {
      profileUpdate.earning_restricted = true;
      profileUpdate.earning_restricted_reason = 'Device already linked to another account';
    }
    await admin.from('user_profiles').update(profileUpdate).eq('id', userId);

    return json({
      success: true,
      restricted: linkedToOtherAccount,
      device: deviceRow,
    });
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
