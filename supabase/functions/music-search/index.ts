import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, type } = await req.json();
    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ tracks: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID");
    const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET");
    const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: "Spotify credentials not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get Spotify access token
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + btoa(SPOTIFY_CLIENT_ID + ":" + SPOTIFY_CLIENT_SECRET),
      },
      body: "grant_type=client_credentials",
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return new Response(JSON.stringify({ error: "Failed to get Spotify token" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Search Spotify for metadata
    const spotifyRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const spotifyData = await spotifyRes.json();
    const spotifyTracks = spotifyData?.tracks?.items || [];

    // For each track, find YouTube video ID
    const tracks = await Promise.all(
      spotifyTracks.slice(0, 15).map(async (track: any) => {
        const title = track.name;
        const artist = track.artists?.[0]?.name || "Unknown";
        const cover = track.album?.images?.[0]?.url || null;
        const duration = Math.round((track.duration_ms || 0) / 1000);

        let youtubeId = null;
        if (YOUTUBE_API_KEY) {
          try {
            const ytQuery = `${title} ${artist} audio`;
            const ytRes = await fetch(
              `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(ytQuery)}&type=video&maxResults=1&key=${YOUTUBE_API_KEY}`
            );
            const ytData = await ytRes.json();
            youtubeId = ytData?.items?.[0]?.id?.videoId || null;
          } catch (e) {
            console.error("YouTube search error:", e);
          }
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

    return new Response(JSON.stringify({ tracks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("music-search error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});