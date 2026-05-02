import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (_e) {
    console.error("safeJson parse failed:", text.slice(0, 200));
    return null;
  }
}

async function findYouTubeIdViaApi(apiKey: string, query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${apiKey}`
    );
    const data = await safeJson(res);
    return data?.items?.[0]?.id?.videoId || null;
  } catch (e) {
    console.error("YouTube API error:", e);
    return null;
  }
}

// Fallback: scrape YouTube search results page for first videoId
async function findYouTubeIdViaScrape(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" } }
    );
    const html = await res.text();
    const m = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    return m?.[1] || null;
  } catch (e) {
    console.error("YouTube scrape error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ tracks: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID");
    const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET");
    const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");

    let spotifyTracks: any[] = [];

    if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + btoa(SPOTIFY_CLIENT_ID + ":" + SPOTIFY_CLIENT_SECRET),
        },
        body: "grant_type=client_credentials",
      });
      const tokenData = await safeJson(tokenRes);
      if (tokenData?.access_token) {
        const sp = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=15`,
          { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
        );
        const spData = await safeJson(sp);
        spotifyTracks = spData?.tracks?.items || [];
      } else {
        console.error("Spotify token missing");
      }
    }

    // For each Spotify track, attach YouTube id (try API, fall back to scrape)
    const tracks = await Promise.all(
      spotifyTracks.slice(0, 15).map(async (track: any) => {
        const title = track.name;
        const artist = track.artists?.[0]?.name || "Unknown";
        const cover = track.album?.images?.[0]?.url || null;
        const duration = Math.round((track.duration_ms || 0) / 1000);
        const ytQuery = `${title} ${artist} audio`;

        let youtubeId: string | null = null;
        if (YOUTUBE_API_KEY) {
          youtubeId = await findYouTubeIdViaApi(YOUTUBE_API_KEY, ytQuery);
        }
        if (!youtubeId) {
          youtubeId = await findYouTubeIdViaScrape(ytQuery);
        }

        return {
          id: `spotify-${track.id}`,
          spotify_id: track.id,
          title,
          artist_name: artist,
          cover_url: cover,
          duration_seconds: duration,
          youtube_id: youtubeId,
          source: "lenory_free",
        };
      })
    );

    // If Spotify returned nothing, fallback: pure YouTube scrape result
    let finalTracks = tracks.filter((t) => t.youtube_id);
    if (finalTracks.length === 0) {
      const ytId = await findYouTubeIdViaScrape(query);
      if (ytId) {
        finalTracks = [
          {
            id: `yt-${ytId}`,
            spotify_id: null as any,
            title: query,
            artist_name: "YouTube",
            cover_url: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
            duration_seconds: 0,
            youtube_id: ytId,
            source: "lenory_free",
          },
        ];
      }
    }

    return new Response(JSON.stringify({ tracks: finalTracks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("music-search error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", tracks: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
