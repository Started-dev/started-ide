import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, linkedin_token } = await req.json();
    if (!linkedin_token) return new Response(JSON.stringify({ ok: false, error: "linkedin_token required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const headers = { Authorization: `Bearer ${linkedin_token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" };
    let result: unknown;

    switch (tool) {
      case "linkedin_me": {
        const r = await fetch("https://api.linkedin.com/v2/userinfo", { headers });
        result = await r.json();
        break;
      }
      case "linkedin_create_post": {
        const r = await fetch("https://api.linkedin.com/v2/ugcPosts", { method: "POST", headers, body: JSON.stringify({ author: input.author, lifecycleState: "PUBLISHED", specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: input.text }, shareMediaCategory: "NONE" } }, visibility: { "com.linkedin.ugc.MemberNetworkVisibility": input.visibility || "PUBLIC" } }) });
        result = await r.json();
        break;
      }
      case "linkedin_get_connections": {
        const r = await fetch(`https://api.linkedin.com/v2/connections?q=viewer&start=${input.start || 0}&count=${input.count || 50}`, { headers });
        result = await r.json();
        break;
      }
      case "linkedin_company_info": {
        const r = await fetch(`https://api.linkedin.com/v2/organizations/${input.organization_id}`, { headers });
        result = await r.json();
        break;
      }
      case "linkedin_company_posts": {
        const r = await fetch(`https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn%3Ali%3Aorganization%3A${input.organization_id})&count=${input.count || 10}`, { headers });
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
