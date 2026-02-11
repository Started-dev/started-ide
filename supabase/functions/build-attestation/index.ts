import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sha256(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalJSON(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJSON).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + sorted.map((k) => JSON.stringify(k) + ":" + canonicalJSON((obj as Record<string, unknown>)[k])).join(",") + "}";
}

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { action } = body;
    const db = getServiceClient();

    switch (action) {
      // ─── Create build run ───
      case "create_run": {
        const { project_id, command, input_snapshot_id, runner_node_id } = body;
        if (!project_id || !command) return json({ error: "Missing fields" }, 400);

        const { data: run, error } = await db.from("build_runs").insert({
          project_id,
          user_id: user.id,
          command,
          input_snapshot_id: input_snapshot_id || null,
          runner_node_id: runner_node_id || null,
          status: "queued",
        }).select("id").single();

        if (error) return json({ error: error.message }, 500);

        // Emit event
        await db.from("project_events").insert({
          project_id,
          actor_type: "user",
          actor_id: user.id,
          event_type: "run.started",
          payload: { build_run_id: run.id, command },
        });

        return json({ ok: true, build_run_id: run.id });
      }

      // ─── Complete build run + create attestation ───
      case "complete_run": {
        const { build_run_id, exit_code, stdout_trunc, stderr_trunc, output_snapshot_id, runner_fingerprint, duration_ms } = body;
        if (!build_run_id) return json({ error: "Missing build_run_id" }, 400);

        const status = exit_code === 0 ? "ok" : "error";

        await db.from("build_runs").update({
          status,
          exit_code,
          stdout_trunc: (stdout_trunc || "").slice(0, 10000),
          stderr_trunc: (stderr_trunc || "").slice(0, 10000),
          output_snapshot_id: output_snapshot_id || null,
          finished_at: new Date().toISOString(),
          duration_ms,
        }).eq("id", build_run_id);

        // Get the run for attestation
        const { data: run } = await db.from("build_runs").select("*").eq("id", build_run_id).single();
        if (!run) return json({ error: "Run not found" }, 404);

        // Create attestation
        const commandHash = await sha256(run.command);
        const stdoutHash = await sha256(stdout_trunc || "");
        const stderrHash = await sha256(stderr_trunc || "");

        const snapshotHash = run.input_snapshot_id
          ? await sha256(`${run.input_snapshot_id}`)
          : await sha256("no-snapshot");

        const attestationData = {
          build_run_id,
          snapshot_hash: snapshotHash,
          command_hash: commandHash,
          runner_fingerprint: runner_fingerprint || { os: "deno", nodeVersion: Deno.version.deno },
          logs_hashes: { stdout_hash: stdoutHash, stderr_hash: stderrHash },
          exit_code,
          duration_ms,
        };

        const attestationHash = await sha256(canonicalJSON(attestationData));

        await db.from("build_attestations").insert({
          build_run_id,
          attestation_hash: attestationHash,
          snapshot_hash: snapshotHash,
          command_hash: commandHash,
          runner_fingerprint: attestationData.runner_fingerprint,
          logs_hashes: attestationData.logs_hashes,
          artifacts_hashes: [],
        });

        // Emit event
        await db.from("project_events").insert({
          project_id: run.project_id,
          actor_type: "system",
          actor_id: null,
          event_type: "run.done",
          payload: {
            build_run_id,
            exit_code,
            attestation_hash: attestationHash,
            duration_ms,
          },
        });

        return json({ ok: true, attestation_hash: attestationHash });
      }

      // ─── Get attestation for a run ───
      case "get_attestation": {
        const { build_run_id } = body;
        if (!build_run_id) return json({ error: "Missing build_run_id" }, 400);

        const { data: attestation } = await db
          .from("build_attestations")
          .select("*")
          .eq("build_run_id", build_run_id)
          .single();

        const { data: run } = await db
          .from("build_runs")
          .select("*")
          .eq("id", build_run_id)
          .single();

        return json({ ok: true, attestation, run });
      }

      // ─── List build runs for project ───
      case "list_runs": {
        const { project_id, limit } = body;
        if (!project_id) return json({ error: "Missing project_id" }, 400);

        const { data: runs } = await db
          .from("build_runs")
          .select("*, build_attestations(attestation_hash)")
          .eq("project_id", project_id)
          .order("created_at", { ascending: false })
          .limit(limit || 50);

        return json({ ok: true, runs: runs || [] });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("build-attestation error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
