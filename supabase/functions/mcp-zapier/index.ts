import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, zapier_webhook_url } = await req.json();

    // Tools that don't need a webhook URL
    const noUrlTools = ["zapier_validate_webhook"];

    if (!zapier_webhook_url && !noUrlTools.includes(tool)) {
      return new Response(JSON.stringify({ ok: false, error: "Missing zapier_webhook_url" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    let result: unknown;

    switch (tool) {
      case "zapier_trigger_webhook": {
        const payload = input.payload || {};
        const res = await fetch(zapier_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            timestamp: new Date().toISOString(),
            source: "started-ide",
          }),
        });
        const text = await res.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        result = { status: res.status, response: parsed };
        break;
      }

      case "zapier_trigger_with_data": {
        const { data, metadata } = input;
        const res = await fetch(zapier_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: data || {},
            metadata: {
              ...(metadata || {}),
              timestamp: new Date().toISOString(),
              source: "started-ide",
            },
          }),
        });
        const text = await res.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        result = { status: res.status, response: parsed };
        break;
      }

      case "zapier_validate_webhook": {
        const url = input.webhook_url || zapier_webhook_url;
        if (!url) {
          result = { valid: false, reason: "No URL provided" };
          break;
        }
        const isValid = /^https:\/\/hooks\.zapier\.com\//.test(url);
        result = { valid: isValid, url, reason: isValid ? "Valid Zapier webhook URL" : "URL must start with https://hooks.zapier.com/" };
        break;
      }

      case "zapier_trigger_catch_hook": {
        const res = await fetch(zapier_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.payload || {}),
        });
        const text = await res.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        result = { status: res.status, response: parsed };
        break;
      }

      case "zapier_multi_trigger": {
        const webhooks: string[] = input.webhook_urls || [];
        const payload = input.payload || {};
        const results = await Promise.allSettled(
          webhooks.map(async (url: string) => {
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
            });
            const text = await res.text();
            let parsed;
            try { parsed = JSON.parse(text); } catch { parsed = text; }
            return { url, status: res.status, response: parsed };
          })
        );
        result = results.map((r, i) =>
          r.status === "fulfilled" ? r.value : { url: webhooks[i], error: (r as PromiseRejectedResult).reason?.message }
        );
        break;
      }

      default:
        return new Response(JSON.stringify({ ok: false, error: `Unknown tool: ${tool}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
