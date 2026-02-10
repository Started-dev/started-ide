import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MCPRequest {
  tool: string;
  input: Record<string, unknown>;
  twilio_account_sid: string;
  twilio_auth_token: string;
}

const BASE = "https://api.twilio.com/2010-04-01";

async function twilioFetch(
  sid: string,
  token: string,
  path: string,
  method = "GET",
  body?: Record<string, string>
) {
  const url = `${BASE}/Accounts/${sid}${path}`;
  const headers: Record<string, string> = {
    Authorization: "Basic " + btoa(`${sid}:${token}`),
  };
  const opts: RequestInit = { method, headers };
  if (body && (method === "POST" || method === "PUT")) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = new URLSearchParams(body).toString();
  }
  const res = await fetch(url, opts);
  return res.json();
}

async function handleTool(req: MCPRequest) {
  const { tool, input, twilio_account_sid: sid, twilio_auth_token: token } = req;
  if (!sid || !token) throw new Error("Twilio Account SID and Auth Token are required");

  switch (tool) {
    case "twilio_send_sms": {
      const { to, from, body: msgBody } = input as { to: string; from: string; body: string };
      if (!to || !from || !msgBody) throw new Error("to, from, and body are required");
      return twilioFetch(sid, token, "/Messages.json", "POST", { To: to, From: from, Body: msgBody });
    }
    case "twilio_list_messages": {
      const limit = (input.limit as number) || 20;
      return twilioFetch(sid, token, `/Messages.json?PageSize=${limit}`);
    }
    case "twilio_get_message": {
      const { message_sid } = input as { message_sid: string };
      if (!message_sid) throw new Error("message_sid is required");
      return twilioFetch(sid, token, `/Messages/${message_sid}.json`);
    }
    case "twilio_list_phone_numbers": {
      return twilioFetch(sid, token, "/IncomingPhoneNumbers.json");
    }
    case "twilio_get_phone_number": {
      const { phone_sid } = input as { phone_sid: string };
      if (!phone_sid) throw new Error("phone_sid is required");
      return twilioFetch(sid, token, `/IncomingPhoneNumbers/${phone_sid}.json`);
    }
    case "twilio_list_calls": {
      const limit = (input.limit as number) || 20;
      return twilioFetch(sid, token, `/Calls.json?PageSize=${limit}`);
    }
    case "twilio_get_account": {
      return twilioFetch(sid, token, ".json");
    }
    case "twilio_lookup_phone": {
      const { phone_number } = input as { phone_number: string };
      if (!phone_number) throw new Error("phone_number is required");
      const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone_number)}`;
      const res = await fetch(url, {
        headers: { Authorization: "Basic " + btoa(`${sid}:${token}`) },
      });
      return res.json();
    }
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const result = await handleTool(body);
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
