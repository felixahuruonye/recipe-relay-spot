export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://almrajoumwliddtmppsm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsbXJham91bXdsaWRkdG1wcHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYyOTM2ODYsImV4cCI6MjA2MTg2OTY4Nn0.eGCVCJQvAZoX8LfJnvSUbkpMQjagxUI-u99TFELjxT4';

const CRAWLER_UA = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|Slackbot|LinkedInBot|Discordbot|SkypeUriPreview|redditbot|Pinterest|Googlebot|Applebot|vkShare|Viber/i;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async function handler(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code') || '';
  const appUrl = `${origin}/?ref=${encodeURIComponent(code)}`;
  const userAgent = req.headers.get('user-agent') || '';

  let profile: any = null;
  try {
    // referral codes are the first 8 chars of the referrer's user id (see SharePlatform.tsx)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_public_profile_preview`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ p_id_prefix: code }),
      }
    );
    const rows = await res.json();
    profile = Array.isArray(rows) ? rows[0] : null;
  } catch {
    profile = null;
  }

  if (!CRAWLER_UA.test(userAgent)) {
    return Response.redirect(appUrl, 302);
  }

  const title = profile?.username
    ? `Join @${profile.username} on Lenory Social`
    : 'Join Lenory Social';
  const description = profile?.bio || 'Earn while you browse, share content, and connect with amazing people.';
  const imageUrl = profile?.avatar_url || `${origin}/og-image.png`;

  const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="profile" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(imageUrl)}" />
<meta property="og:url" content="${escapeHtml(appUrl)}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(appUrl)}" />
</head><body>Redirecting to Lenory Social&hellip;</body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}