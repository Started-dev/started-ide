import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://api.x.com/2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, twitter_bearer_token } = await req.json();
    if (!twitter_bearer_token) return new Response(JSON.stringify({ ok: false, error: "twitter_bearer_token required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const headers = { Authorization: `Bearer ${twitter_bearer_token}`, "Content-Type": "application/json" };
    let result: unknown;

    switch (tool) {
      case "twitter_user_lookup": {
        const r = await fetch(`${BASE}/users/by/username/${input.username}?user.fields=public_metrics,description,created_at,profile_image_url`, { headers });
        result = await r.json();
        break;
      }
      case "twitter_user_tweets": {
        const r = await fetch(`${BASE}/users/${input.user_id}/tweets?max_results=${input.max_results || 10}&tweet.fields=created_at,public_metrics`, { headers });
        result = await r.json();
        break;
      }
      case "twitter_search_recent": {
        const r = await fetch(`${BASE}/tweets/search/recent?query=${encodeURIComponent(input.query)}&max_results=${input.max_results || 10}&tweet.fields=created_at,public_metrics,author_id`, { headers });
        result = await r.json();
        break;
      }
      case "twitter_get_tweet": {
        const r = await fetch(`${BASE}/tweets/${input.tweet_id}?tweet.fields=created_at,public_metrics,author_id,entities`, { headers });
        result = await r.json();
        break;
      }
      case "twitter_user_followers": {
        const r = await fetch(`${BASE}/users/${input.user_id}/followers?max_results=${input.max_results || 100}&user.fields=public_metrics`, { headers });
        result = await r.json();
        break;
      }
      case "twitter_trending": {
        const r = await fetch(`${BASE}/tweets/search/recent?query=${encodeURIComponent(input.query || "trending")}&max_results=10&tweet.fields=public_metrics&sort_order=relevancy`, { headers });
        result = await r.json();
        break;
      }
      default:
        return new Response(JSON.stringify({ ok: false, error: `Unknown tool: ${tool}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
