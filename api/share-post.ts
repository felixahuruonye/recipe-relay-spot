export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://almrajoumwliddtmppsm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsbXJham91bXdsaWRkdG1wcHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYyOTM2ODYsImV4cCI6MjA2MTg2OTY4Nn0.eGCVCJQvAZoX8LfJnvSUbkpMQjagxUI-u99TFELjxT4';

// Known social-media / link-preview crawler user agents. If the request is
// NOT from one of these, we just redirect straight into the real app - only
// crawlers need the special HTML-with-OG-tags response.
const CRAWLER_UA = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|Slackbot|LinkedInBot|Discordbot|SkypeUriPreview|redditbot|Pinterest|Googlebot|Applebot|vkShare|Viber|Snapchat|Instagram|TikTok|iMessage|Bingbot/i;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isVideoUrl(url?: string) {
  return !!url && (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url) || /\/video\//i.test(url));
}

export default async function handler(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const postId = searchParams.get('id') || '';
  const appUrl = `${origin}/?post=${encodeURIComponent(postId)}`;
  const userAgent = req.headers.get('user-agent') || '';

  let post: any = null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}&select=title,body,media_urls,thumbnail_url,media_type,user_id&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const rows = await res.json();
    post = Array.isArray(rows) ? rows[0] : null;
  } catch {
    post = null;
  }

  // Regular users (not crawlers) just get sent straight into the app.
  if (!CRAWLER_UA.test(userAgent)) {
    return Response.redirect(appUrl, 302);
  }

  const title = post?.title ? `${post.title} · Lenory Social` : 'Lenory Social';
  const description = (post?.body || 'Check out this post on Lenory Social!').slice(0, 200);
  const firstMedia: string | undefined = post?.media_urls?.[0];
  const isVideo = post?.media_type === 'video' || isVideoUrl(firstMedia);

  // For videos, prefer the stored thumbnail_url; then fall back to the app logo.
  // For images, use the image itself. Never point og:image at a raw video.
  let imageUrl: string;
  if (isVideo) {
    imageUrl = post?.thumbnail_url || `${origin}/lenory-logo.png`;
  } else if (firstMedia) {
    imageUrl = firstMedia;
  } else {
    imageUrl = `${origin}/lenory-logo.png`;
  }

  const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="${isVideo ? 'video.other' : 'article'}" />
<meta property="og:site_name" content="Lenory Social" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(imageUrl)}" />
<meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${escapeHtml(appUrl)}" />
<meta name="twitter:card" content="${isVideo ? 'player' : 'summary_large_image'}" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
${isVideo && firstMedia ? `<meta property="og:video" content="${escapeHtml(firstMedia)}" />
<meta property="og:video:secure_url" content="${escapeHtml(firstMedia)}" />
<meta property="og:video:type" content="video/mp4" />
<meta property="og:video:width" content="720" />
<meta property="og:video:height" content="1280" />` : ''}
<meta http-equiv="refresh" content="0; url=${escapeHtml(appUrl)}" />
</head><body>Redirecting to Lenory Social&hellip;</body></html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=600',
    },
  });
}
