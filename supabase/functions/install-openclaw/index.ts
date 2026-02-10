import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function generateSlug(): string {
  const bytes = new Uint8Array(16); // 128 bits of entropy
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Validate auth
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Support _method override since supabase.functions.invoke always sends POST
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = {}; }
    }
    const effectiveMethod = (body._method as string)?.toUpperCase() || req.method;

    if (effectiveMethod === "POST") {
      const { llm_key, project_id } = body;

      if (!llm_key || !project_id) {
        return new Response(
          JSON.stringify({ error: "llm_key and project_id required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Verify user owns the project
      const { data: project } = await supabase
        .from("projects")
        .select("id")
        .eq("id", project_id)
        .eq("owner_id", user.id)
        .single();

      if (!project) {
        return new Response(
          JSON.stringify({ error: "Project not found or not owned by user" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const slug = generateSlug();
      const instanceUrl = `https://${slug}.moltbot.emergent.to`;

      // Create installation record
      const { data: installation, error: insertError } = await supabase
        .from("openclaw_installations")
        .insert({
          project_id,
          user_id: user.id,
          slug,
          instance_url: instanceUrl,
          status: "installing",
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Run the install script in background via run-command
      const installCommand = `NEW_LLM_KEY="${llm_key}" nohup bash -c "$(curl -fsSL https://moltbot.emergent.to/install.sh)" > /tmp/moltbot_install.log 2>&1 &`;

      const runRes = await fetch(`${supabaseUrl}/functions/v1/run-command`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        },
        body: JSON.stringify({
          command: installCommand,
          project_id,
        }),
      });

      const runData = await runRes.json();

      return new Response(
        JSON.stringify({
          ok: true,
          install_id: installation.id,
          slug,
          instance_url: instanceUrl,
          status: "installing",
          run_result: runData,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (effectiveMethod === "GET") {
      const url = new URL(req.url);
      const installId = url.searchParams.get("install_id") || (body.install_id as string) || null;

      if (!installId) {
        // List installations for user
        const { data: installations } = await supabase
          .from("openclaw_installations")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        return new Response(
          JSON.stringify({ ok: true, installations: installations ?? [] }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Get specific installation
      const { data: installation } = await supabase
        .from("openclaw_installations")
        .select("*")
        .eq("id", installId)
        .eq("user_id", user.id)
        .single();

      if (!installation) {
        return new Response(
          JSON.stringify({ error: "Installation not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // If still installing, poll the log file
      if (installation.status === "installing") {
        const authHeader2 = req.headers.get("authorization") ?? "";
        const logRes = await fetch(
          `${supabaseUrl}/functions/v1/run-command`,
          {
            method: "POST",
            headers: {
              Authorization: authHeader2,
              "Content-Type": "application/json",
              apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            },
            body: JSON.stringify({
              command: "tail -50 /tmp/moltbot_install.log 2>/dev/null || echo 'Log not available yet'",
              project_id: installation.project_id,
            }),
          }
        );

        const logData = await logRes.json();
        const logs = logData?.stdout || logData?.output || "";

        // Check if install completed (look for success markers in log)
        const isComplete =
          logs.includes("Installation complete") ||
          logs.includes("MoltBot is running") ||
          logs.includes("Successfully installed");
        const isFailed =
          logs.includes("FATAL") ||
          logs.includes("Installation failed") ||
          logs.includes("Error:");

        const newStatus = isComplete
          ? "completed"
          : isFailed
          ? "failed"
          : "installing";

        // Update status and logs
        await supabase
          .from("openclaw_installations")
          .update({
            status: newStatus,
            logs: logs.slice(-5000), // Keep last 5KB
            ...(newStatus === "completed"
              ? { completed_at: new Date().toISOString() }
              : {}),
          })
          .eq("id", installId);

        return new Response(
          JSON.stringify({
            ok: true,
            ...installation,
            status: newStatus,
            logs,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ ok: true, ...installation }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
