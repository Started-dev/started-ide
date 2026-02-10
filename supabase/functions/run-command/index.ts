import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Denylist for dangerous commands ───
const DENIED_PATTERNS = [
  /^rm\s+-rf\s+[\/~]/,
  /^sudo\s/,
  /^dd\s/,
  /^mkfs/,
  /^chmod\s+777/,
  /^ssh\s/,
  /^scp\s/,
  /^cat\s+\/etc\/(passwd|shadow)/,
  /^cat\s+~\/\.ssh/,
  /base64\s*\|\s*bash/,
  /curl\s.*\|\s*(bash|sh)/,
  /wget\s.*\|\s*(bash|sh)/,
];

// ─── Auth helper ───
async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ─── Permission check ───
async function checkPermission(
  projectId: string | undefined,
  command: string,
  db: ReturnType<typeof createClient>
): Promise<{ effect: "allow" | "ask" | "deny"; reason?: string }> {
  if (!projectId) return { effect: "allow" };

  const { data: rules } = await db
    .from("project_permissions")
    .select("rule_type, subject, effect, reason")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (!rules?.length) return { effect: "allow" };

  for (const rule of rules) {
    let matches = false;
    if (rule.rule_type === "command_prefix" && command.startsWith(rule.subject)) {
      matches = true;
    } else if (rule.rule_type === "regex") {
      try { matches = new RegExp(rule.subject).test(command); } catch { /* ignore */ }
    }
    if (matches) {
      return { effect: rule.effect as "allow" | "ask" | "deny", reason: rule.reason || undefined };
    }
  }
  return { effect: "allow" };
}

// ─── Shell builtins ───
function executeBuiltin(cmd: string, cwd: string): { handled: boolean; stdout?: string; stderr?: string; exitCode?: number; newCwd?: string } {
  const parts = cmd.split(/\s+/);
  const bin = parts[0];
  switch (bin) {
    case "echo": return { handled: true, stdout: parts.slice(1).join(" ") + "\n", exitCode: 0 };
    case "pwd": return { handled: true, stdout: cwd + "\n", exitCode: 0 };
    case "date": return { handled: true, stdout: new Date().toISOString() + "\n", exitCode: 0 };
    case "whoami": return { handled: true, stdout: "runner\n", exitCode: 0 };
    case "hostname": return { handled: true, stdout: "started-runner\n", exitCode: 0 };
    case "uname": {
      const flag = parts[1] || "";
      if (flag === "-a") return { handled: true, stdout: "Deno 1.x (Started Runner) aarch64\n", exitCode: 0 };
      return { handled: true, stdout: "Deno\n", exitCode: 0 };
    }
    case "which": {
      const target = parts[1];
      if (!target) return { handled: true, stderr: "which: missing argument\n", exitCode: 1 };
      const available = ["node", "deno", "npx", "npm", "echo", "pwd", "date", "cat", "ls", "env", "which", "whoami", "hostname", "uname", "true", "false", "sleep", "printf", "test", "expr", "python", "python3", "ruby", "php", "go", "rustc", "cargo", "gcc", "g++", "javac", "java", "solc", "dart", "swiftc", "kotlinc", "Rscript", "gem", "composer", "pip", "pip3", "bundle"];
      if (available.includes(target)) return { handled: true, stdout: `/usr/bin/${target}\n`, exitCode: 0 };
      return { handled: true, stderr: `which: ${target}: not found\n`, exitCode: 1 };
    }
    case "env": {
      const safeVars = { DENO_VERSION: Deno.version.deno, TS_VERSION: Deno.version.typescript, V8_VERSION: Deno.version.v8, HOME: "/home/runner", USER: "runner", SHELL: "/bin/sh", PWD: cwd };
      const out = Object.entries(safeVars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
      return { handled: true, stdout: out, exitCode: 0 };
    }
    case "true": return { handled: true, stdout: "", exitCode: 0 };
    case "false": return { handled: true, stdout: "", exitCode: 1 };
    case "printf": {
      const fmt = parts.slice(1).join(" ").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
      return { handled: true, stdout: fmt, exitCode: 0 };
    }
    case "sleep": {
      const secs = parseFloat(parts[1] || "0");
      return { handled: true, stdout: `(slept ${secs}s)\n`, exitCode: 0 };
    }
    case "expr": {
      try {
        const expression = parts.slice(1).join(" ");
        const safeExpr = expression.replace(/[^0-9+\-*/%() ]/g, "");
        const result = Function(`"use strict"; return (${safeExpr})`)();
        return { handled: true, stdout: String(result) + "\n", exitCode: 0 };
      } catch {
        return { handled: true, stderr: "expr: syntax error\n", exitCode: 2 };
      }
    }
    case "seq": {
      const nums = parts.slice(1).map(Number).filter(n => !isNaN(n));
      if (nums.length === 1) return { handled: true, stdout: Array.from({ length: nums[0] }, (_, i) => i + 1).join("\n") + "\n", exitCode: 0 };
      if (nums.length === 2) {
        const out: number[] = [];
        for (let i = nums[0]; i <= nums[1]; i++) out.push(i);
        return { handled: true, stdout: out.join("\n") + "\n", exitCode: 0 };
      }
      return { handled: false };
    }
    default: return { handled: false };
  }
}

// ─── JS execution sandbox ───
async function executeJSCode(code: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const fakeConsole = {
    log: (...args: unknown[]) => logs.push(args.map(a => typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)).join(" ")),
    error: (...args: unknown[]) => errors.push(args.map(a => typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)).join(" ")),
    warn: (...args: unknown[]) => logs.push("[warn] " + args.map(a => String(a)).join(" ")),
    info: (...args: unknown[]) => logs.push("[info] " + args.map(a => String(a)).join(" ")),
    table: (data: unknown) => logs.push(JSON.stringify(data, null, 2)),
    dir: (obj: unknown) => logs.push(JSON.stringify(obj, null, 2)),
    time: () => {}, timeEnd: () => {},
    assert: (cond: unknown, ...args: unknown[]) => { if (!cond) errors.push("Assertion failed: " + args.join(" ")); },
  };
  try {
    const fn = new Function("console", "Math", "JSON", "Date", "Array", "Object", "String", "Number", "Boolean", "RegExp", "Map", "Set", "Promise", "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent", "setTimeout",
      `"use strict";\n${code}`
    );
    const result = fn(fakeConsole, Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp, Map, Set, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, () => {});
    if (result !== undefined) logs.push(typeof result === "object" ? JSON.stringify(result, null, 2) : String(result));
    return { stdout: logs.join("\n") + (logs.length ? "\n" : ""), stderr: errors.join("\n") + (errors.length ? "\n" : ""), exitCode: errors.length > 0 ? 1 : 0 };
  } catch (err) {
    return { stdout: logs.join("\n") + (logs.length ? "\n" : ""), stderr: (err instanceof Error ? `${err.name}: ${err.message}` : String(err)) + "\n", exitCode: 1 };
  }
}

// ─── Python-like execution ───
function executePythonLike(code: string): { stdout: string; stderr: string; exitCode: number } {
  const lines: string[] = [];
  try {
    const printRegex = /^print\s*\((.+)\)\s*$/;
    for (const line of code.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const m = trimmed.match(printRegex);
      if (m) {
        try {
          const arg = m[1].trim();
          const val = Function(`"use strict"; return (${arg.replace(/^f"/,'("').replace(/^f'/,"('")})`)();
          lines.push(String(val));
        } catch { lines.push(m[1].replace(/^["']|["']$/g, "")); }
      } else if (trimmed.match(/^\w+\s*=\s*.+$/)) {
        // assignment
      } else {
        try {
          const val = Function(`"use strict"; return (${trimmed})`)();
          if (val !== undefined) lines.push(String(val));
        } catch {
          return { stdout: lines.join("\n") + "\n", stderr: `SyntaxError: unsupported Python syntax: ${trimmed}\n\nNote: Full Python execution requires a Python runtime.\n`, exitCode: 1 };
        }
      }
    }
    return { stdout: lines.join("\n") + (lines.length ? "\n" : ""), stderr: "", exitCode: 0 };
  } catch (err) {
    return { stdout: lines.join("\n") + "\n", stderr: (err instanceof Error ? err.message : String(err)) + "\n", exitCode: 1 };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { command, cwd, timeout_s, project_id } = await req.json() as {
      command: string;
      cwd?: string;
      timeout_s?: number;
      project_id?: string;
    };

    if (!command) {
      return new Response(
        JSON.stringify({ error: "Missing 'command'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentCwd = cwd || "/workspace";
    const user = await getUser(req);
    const db = getServiceClient();

    // ─── Denylist check ───
    for (const pattern of DENIED_PATTERNS) {
      if (pattern.test(command)) {
        // Audit the denial
        if (project_id && user?.id) {
          await db.from("mcp_audit_log").insert({
            project_id, user_id: user.id, server_key: "runner",
            tool_name: "run_command", risk: "write", status: "denied",
            input_hash: command.slice(0, 100), error: "Denied by security policy",
          }).then(() => {}).catch(() => {});
        }
        return new Response(
          JSON.stringify({ ok: false, stdout: "", stderr: `⛔ Command denied by security policy: ${command}`, exitCode: 1, cwd: currentCwd, durationMs: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── Project permission check ───
    if (project_id) {
      const perm = await checkPermission(project_id, command, db);
      if (perm.effect === "deny") {
        return new Response(
          JSON.stringify({ ok: false, stdout: "", stderr: `⛔ Command blocked by project permission rule: ${perm.reason || command}`, exitCode: 1, cwd: currentCwd, durationMs: 0, permission: "deny" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (perm.effect === "ask") {
        return new Response(
          JSON.stringify({ ok: false, requiresApproval: true, command, reason: perm.reason || "This command requires approval", cwd: currentCwd }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const startTime = Date.now();
    const encoder = new TextEncoder();

    // ─── cd ───
    if (command.startsWith("cd ")) {
      const target = command.slice(3).trim();
      let newCwd = currentCwd;
      if (target.startsWith("/")) newCwd = target;
      else if (target === "..") { const parts = currentCwd.split("/").filter(Boolean); parts.pop(); newCwd = "/" + parts.join("/"); }
      else if (target === "~") newCwd = "/home/runner";
      else newCwd = currentCwd === "/" ? `/${target}` : `${currentCwd}/${target}`;
      return new Response(
        JSON.stringify({ ok: true, stdout: "", stderr: "", exitCode: 0, cwd: newCwd, durationMs: 5 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Builtins ───
    const builtin = executeBuiltin(command, currentCwd);
    if (builtin.handled) {
      const durationMs = Date.now() - startTime;
      // Persist run
      if (project_id && user?.id) {
        db.from("runs").insert({
          project_id, user_id: user.id, command,
          stdout: (builtin.stdout || "").slice(0, 10000),
          stderr: (builtin.stderr || "").slice(0, 10000),
          exit_code: builtin.exitCode ?? 0,
          status: (builtin.exitCode ?? 0) === 0 ? "success" : "failed",
        }).then(() => {}).catch(() => {});
      }
      const stream = new ReadableStream({
        start(controller) {
          if (builtin.stderr) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: builtin.stderr })}\n\n`));
          if (builtin.stdout) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stdout", data: builtin.stdout })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: builtin.exitCode ?? 0, cwd: builtin.newCwd || currentCwd, durationMs })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    // ─── Inline JS ───
    const nodeEvalMatch = command.match(/^(?:node|deno)\s+(?:-e|eval)\s+["'](.+)["']$/s);
    if (nodeEvalMatch) {
      const result = await executeJSCode(nodeEvalMatch[1]);
      const durationMs = Date.now() - startTime;
      if (project_id && user?.id) {
        db.from("runs").insert({ project_id, user_id: user.id, command, stdout: result.stdout.slice(0, 10000), stderr: result.stderr.slice(0, 10000), exit_code: result.exitCode, status: result.exitCode === 0 ? "success" : "failed" }).then(() => {}).catch(() => {});
      }
      const stream = new ReadableStream({
        start(controller) {
          if (result.stderr) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: result.stderr })}\n\n`));
          if (result.stdout) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stdout", data: result.stdout })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: result.exitCode, cwd: currentCwd, durationMs })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    // ─── Inline Python ───
    const pythonEvalMatch = command.match(/^python[3]?\s+-c\s+["'](.+)["']$/s);
    if (pythonEvalMatch) {
      const result = executePythonLike(pythonEvalMatch[1]);
      const durationMs = Date.now() - startTime;
      if (project_id && user?.id) {
        db.from("runs").insert({ project_id, user_id: user.id, command, stdout: result.stdout.slice(0, 10000), stderr: result.stderr.slice(0, 10000), exit_code: result.exitCode, status: result.exitCode === 0 ? "success" : "failed" }).then(() => {}).catch(() => {});
      }
      const stream = new ReadableStream({
        start(controller) {
          if (result.stderr) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: result.stderr })}\n\n`));
          if (result.stdout) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stdout", data: result.stdout })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: result.exitCode, cwd: currentCwd, durationMs })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    // ─── Inline Ruby/PHP/R (simplified) ───
    const rubyEvalMatch = command.match(/^ruby\s+-e\s+["'](.+)["']$/s);
    const phpEvalMatch = command.match(/^php\s+-r\s+["'](.+)["']$/s);
    const rEvalMatch = command.match(/^Rscript\s+-e\s+["'](.+)["']$/s);

    if (rubyEvalMatch || phpEvalMatch || rEvalMatch) {
      const code = (rubyEvalMatch || phpEvalMatch || rEvalMatch)![1];
      const lines: string[] = [];
      for (const stmt of code.split(";")) {
        const trimmed = stmt.trim();
        const m = trimmed.match(/^(?:puts|echo|print|cat)\s*\(?(.+?)\)?\s*$/);
        if (m) {
          try { lines.push(String(Function(`"use strict"; return (${m[1]})`)())); }
          catch { lines.push(m[1].replace(/^["']|["']$/g, "")); }
        }
      }
      const durationMs = Date.now() - startTime;
      const stream = new ReadableStream({
        start(controller) {
          if (lines.length) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stdout", data: lines.join("\n") + "\n" })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: 0, cwd: currentCwd, durationMs })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    // ─── Pipe/compound commands ───
    if (command.includes(" | ") || command.includes(" && ") || command.includes(" ; ")) {
      const durationMs = Date.now() - startTime;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: "⚠ Pipe/compound commands are not fully supported.\nTip: Run each command separately.\n" })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: 1, cwd: currentCwd, durationMs })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    // ─── Fallback: unrecognized command ───
    const durationMs = Date.now() - startTime;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: `$ ${command}\nbash: ${command.split(/\s+/)[0]}: command requires a runner session.\n\nTo run complex commands, connect a runner via Project Settings.\nBuilt-in support: echo, pwd, date, node -e, python -c, ruby -e, php -r\n` })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: 127, cwd: currentCwd, durationMs })}\n\n`));
        controller.close();
      },
    });

    if (project_id && user?.id) {
      db.from("runs").insert({ project_id, user_id: user.id, command, stderr: `command not found: ${command.split(/\s+/)[0]}`, exit_code: 127, status: "failed" }).then(() => {}).catch(() => {});
    }

    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (e) {
    console.error("run-command error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}
