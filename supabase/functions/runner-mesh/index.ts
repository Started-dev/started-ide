import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getServiceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Node Scheduler ───

interface ScheduleRequest {
  project_id: string;
  required_capabilities?: {
    runtimes?: string[];
    web3?: string[];
    gpu?: boolean;
  };
  trust_minimum?: string; // tier0, tier1, tier2
  region?: string;
}

async function scheduleNode(
  db: ReturnType<typeof createClient>,
  req: ScheduleRequest
): Promise<{ node_id: string; name: string; base_url: string; trust_tier: string } | null> {
  const trustOrder = ["tier0", "tier1", "tier2"];
  const minTrustIdx = trustOrder.indexOf(req.trust_minimum || "tier0");

  // Get active nodes
  const { data: nodes } = await db
    .from("runner_nodes")
    .select("*")
    .eq("status", "active");

  if (!nodes || nodes.length === 0) return null;

  // Filter by trust tier
  const eligible = nodes.filter((n) => {
    const tierIdx = trustOrder.indexOf(n.trust_tier);
    return tierIdx >= 0 && tierIdx <= (minTrustIdx >= 0 ? minTrustIdx : 2);
  });

  // Filter by capabilities
  const matching = eligible.filter((n) => {
    const caps = n.capabilities as {
      runtimes?: string[];
      web3?: string[];
      gpu?: boolean;
      maxConcurrency?: number;
    };

    if (req.required_capabilities?.runtimes?.length) {
      const nodeRuntimes = caps.runtimes || [];
      if (!req.required_capabilities.runtimes.every((r) => nodeRuntimes.includes(r))) return false;
    }
    if (req.required_capabilities?.web3?.length) {
      const nodeWeb3 = caps.web3 || [];
      if (!req.required_capabilities.web3.every((w) => nodeWeb3.includes(w))) return false;
    }
    if (req.required_capabilities?.gpu && !caps.gpu) return false;
    return true;
  });

  if (matching.length === 0) return eligible.length > 0
    ? { node_id: eligible[0].id, name: eligible[0].name, base_url: eligible[0].base_url, trust_tier: eligible[0].trust_tier }
    : null;

  // Prefer region match, then tier0
  const regionMatch = req.region
    ? matching.find((n) => n.region === req.region)
    : null;

  const selected = regionMatch || matching.sort((a, b) => {
    const aIdx = trustOrder.indexOf(a.trust_tier);
    const bIdx = trustOrder.indexOf(b.trust_tier);
    return aIdx - bIdx;
  })[0];

  return {
    node_id: selected.id,
    name: selected.name,
    base_url: selected.base_url,
    trust_tier: selected.trust_tier,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { action } = body;
    const db = getServiceClient();

    switch (action) {
      // ─── List nodes ───
      case "list_nodes": {
        const { data: nodes } = await db
          .from("runner_nodes")
          .select("id, name, base_url, region, trust_tier, capabilities, pricing, status, last_heartbeat")
          .order("trust_tier")
          .order("name");

        return json({ ok: true, nodes: nodes || [] });
      }

      // ─── Schedule a node for a project ───
      case "schedule": {
        const { project_id, required_capabilities, trust_minimum, region } = body;
        if (!project_id) return json({ error: "Missing project_id" }, 400);

        const node = await scheduleNode(db, { project_id, required_capabilities, trust_minimum, region });
        if (!node) return json({ error: "No suitable runner node available" }, 503);

        return json({ ok: true, node });
      }

      // ─── Create/get session on a node ───
      case "get_session": {
        const { project_id, runner_node_id } = body;
        if (!project_id || !runner_node_id) return json({ error: "Missing fields" }, 400);

        // Check existing session
        const { data: existing } = await db
          .from("runner_sessions")
          .select("*")
          .eq("project_id", project_id)
          .eq("runner_node_id", runner_node_id)
          .single();

        if (existing) {
          return json({ ok: true, session: existing, reused: true });
        }

        // Get node
        const { data: node } = await db
          .from("runner_nodes")
          .select("base_url")
          .eq("id", runner_node_id)
          .single();

        if (!node) return json({ error: "Node not found" }, 404);

        // Create remote session (best-effort call to node API)
        let remoteSessionId = `session-${Date.now()}`;
        try {
          const resp = await fetch(`${node.base_url}/v1/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: project_id }),
          });
          if (resp.ok) {
            const data = await resp.json();
            remoteSessionId = data.session_id || remoteSessionId;
          }
        } catch {
          // Node may not be reachable yet; use generated ID
        }

        const { data: session, error } = await db.from("runner_sessions").insert({
          project_id,
          runner_node_id,
          remote_session_id: remoteSessionId,
        }).select("*").single();

        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, session, reused: false });
      }

      // ─── Node health check ───
      case "health": {
        const { node_id } = body;
        if (!node_id) return json({ error: "Missing node_id" }, 400);

        const { data: node } = await db
          .from("runner_nodes")
          .select("base_url, name, status")
          .eq("id", node_id)
          .single();

        if (!node) return json({ error: "Node not found" }, 404);

        let healthy = false;
        let fingerprint = null;
        try {
          const resp = await fetch(`${node.base_url}/v1/health`, { signal: AbortSignal.timeout(5000) });
          healthy = resp.ok;
          if (resp.ok) {
            try {
              const fpResp = await fetch(`${node.base_url}/v1/fingerprint`, { signal: AbortSignal.timeout(5000) });
              if (fpResp.ok) fingerprint = await fpResp.json();
            } catch { /* ignore */ }
          }
        } catch { /* timeout or network error */ }

        // Update heartbeat
        if (healthy) {
          await db.from("runner_nodes").update({
            last_heartbeat: new Date().toISOString(),
            status: "active",
          }).eq("id", node_id);
        } else {
          await db.from("runner_nodes").update({ status: "degraded" }).eq("id", node_id);
        }

        return json({ ok: true, healthy, fingerprint, node_name: node.name });
      }

      // ─── Node fingerprint ───
      case "fingerprint": {
        const { node_id } = body;
        if (!node_id) return json({ error: "Missing node_id" }, 400);

        const { data: node } = await db.from("runner_nodes").select("base_url").eq("id", node_id).single();
        if (!node) return json({ error: "Node not found" }, 404);

        try {
          const resp = await fetch(`${node.base_url}/v1/fingerprint`, { signal: AbortSignal.timeout(5000) });
          if (!resp.ok) return json({ error: "Fingerprint unavailable" }, 502);
          const data = await resp.json();
          return json({ ok: true, fingerprint: data });
        } catch {
          return json({ error: "Node unreachable" }, 502);
        }
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("runner-mesh error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
