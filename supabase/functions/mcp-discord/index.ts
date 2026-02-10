import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_API = "https://discord.com/api/v10";

async function discordFetch(path: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...opts,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!res.ok) throw new Error(typeof parsed === "object" ? JSON.stringify(parsed) : parsed);
  return parsed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, discord_bot_token } = await req.json();
    if (!discord_bot_token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing discord_bot_token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    let result: unknown;

    switch (tool) {
      // ── Bot ──
      case "discord_get_me": {
        result = await discordFetch("/users/@me", discord_bot_token);
        break;
      }
      // ── Guilds ──
      case "discord_list_guilds": {
        result = await discordFetch("/users/@me/guilds", discord_bot_token);
        break;
      }
      case "discord_get_guild": {
        result = await discordFetch(`/guilds/${input.guild_id}?with_counts=true`, discord_bot_token);
        break;
      }
      // ── Channels ──
      case "discord_list_channels": {
        result = await discordFetch(`/guilds/${input.guild_id}/channels`, discord_bot_token);
        break;
      }
      case "discord_get_channel": {
        result = await discordFetch(`/channels/${input.channel_id}`, discord_bot_token);
        break;
      }
      case "discord_create_channel": {
        const body: Record<string, unknown> = { name: input.name, type: input.type || 0 };
        if (input.topic) body.topic = input.topic;
        if (input.parent_id) body.parent_id = input.parent_id;
        result = await discordFetch(`/guilds/${input.guild_id}/channels`, discord_bot_token, {
          method: "POST", body: JSON.stringify(body),
        });
        break;
      }
      case "discord_delete_channel": {
        result = await discordFetch(`/channels/${input.channel_id}`, discord_bot_token, { method: "DELETE" });
        break;
      }
      // ── Messages ──
      case "discord_send_message": {
        const body: Record<string, unknown> = { content: input.content };
        if (input.embeds) body.embeds = input.embeds;
        result = await discordFetch(`/channels/${input.channel_id}/messages`, discord_bot_token, {
          method: "POST", body: JSON.stringify(body),
        });
        break;
      }
      case "discord_get_messages": {
        const limit = input.limit || 50;
        result = await discordFetch(`/channels/${input.channel_id}/messages?limit=${limit}`, discord_bot_token);
        break;
      }
      case "discord_edit_message": {
        result = await discordFetch(`/channels/${input.channel_id}/messages/${input.message_id}`, discord_bot_token, {
          method: "PATCH", body: JSON.stringify({ content: input.content }),
        });
        break;
      }
      case "discord_delete_message": {
        await discordFetch(`/channels/${input.channel_id}/messages/${input.message_id}`, discord_bot_token, { method: "DELETE" });
        result = { deleted: true, message_id: input.message_id };
        break;
      }
      // ── Reactions ──
      case "discord_add_reaction": {
        await discordFetch(`/channels/${input.channel_id}/messages/${input.message_id}/reactions/${encodeURIComponent(input.emoji)}/@me`, discord_bot_token, { method: "PUT" });
        result = { added: true };
        break;
      }
      // ── Members ──
      case "discord_list_members": {
        const limit = input.limit || 100;
        result = await discordFetch(`/guilds/${input.guild_id}/members?limit=${limit}`, discord_bot_token);
        break;
      }
      case "discord_get_member": {
        result = await discordFetch(`/guilds/${input.guild_id}/members/${input.user_id}`, discord_bot_token);
        break;
      }
      default:
        return new Response(JSON.stringify({ ok: false, error: `Unknown tool: ${tool}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
