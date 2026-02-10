import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function slackFetch(path: string, token: string, options: RequestInit = {}) {
  const resp = await fetch(`https://slack.com/api/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || `Slack API error`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { tool, input, slack_token } = await req.json();
    if (!tool || !slack_token) {
      return json({ error: "missing 'tool' or 'slack_token'" }, 400);
    }

    let result: unknown;

    switch (tool) {
      case "slack_list_channels": {
        const limit = input?.limit || 100;
        const types = input?.types || "public_channel,private_channel";
        result = await slackFetch(`conversations.list?limit=${limit}&types=${types}`, slack_token);
        break;
      }

      case "slack_get_channel_info": {
        const { channel } = input || {};
        if (!channel) return json({ error: "channel required" }, 400);
        result = await slackFetch(`conversations.info?channel=${channel}`, slack_token);
        break;
      }

      case "slack_post_message": {
        const { channel, text, blocks } = input || {};
        if (!channel || !text) return json({ error: "channel and text required" }, 400);
        const body: Record<string, unknown> = { channel, text };
        if (blocks) body.blocks = blocks;
        result = await slackFetch("chat.postMessage", slack_token, {
          method: "POST",
          body: JSON.stringify(body),
        });
        break;
      }

      case "slack_update_message": {
        const { channel, ts, text } = input || {};
        if (!channel || !ts || !text) return json({ error: "channel, ts, text required" }, 400);
        result = await slackFetch("chat.update", slack_token, {
          method: "POST",
          body: JSON.stringify({ channel, ts, text }),
        });
        break;
      }

      case "slack_delete_message": {
        const { channel, ts } = input || {};
        if (!channel || !ts) return json({ error: "channel and ts required" }, 400);
        result = await slackFetch("chat.delete", slack_token, {
          method: "POST",
          body: JSON.stringify({ channel, ts }),
        });
        break;
      }

      case "slack_list_users": {
        const limit = input?.limit || 100;
        result = await slackFetch(`users.list?limit=${limit}`, slack_token);
        break;
      }

      case "slack_get_user_info": {
        const { user: userId } = input || {};
        if (!userId) return json({ error: "user required" }, 400);
        result = await slackFetch(`users.info?user=${userId}`, slack_token);
        break;
      }

      case "slack_channel_history": {
        const { channel, limit: histLimit } = input || {};
        if (!channel) return json({ error: "channel required" }, 400);
        result = await slackFetch(`conversations.history?channel=${channel}&limit=${histLimit || 20}`, slack_token);
        break;
      }

      case "slack_set_topic": {
        const { channel, topic } = input || {};
        if (!channel || !topic) return json({ error: "channel and topic required" }, 400);
        result = await slackFetch("conversations.setTopic", slack_token, {
          method: "POST",
          body: JSON.stringify({ channel, topic }),
        });
        break;
      }

      case "slack_add_reaction": {
        const { channel, timestamp, name } = input || {};
        if (!channel || !timestamp || !name) return json({ error: "channel, timestamp, name required" }, 400);
        result = await slackFetch("reactions.add", slack_token, {
          method: "POST",
          body: JSON.stringify({ channel, timestamp, name }),
        });
        break;
      }

      default:
        return json({ error: `Unknown tool: ${tool}` }, 400);
    }

    return json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return json({ ok: false, error: message }, 500);
  }
});
