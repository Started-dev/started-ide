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

// ─── Feature detection: can we use Deno.Command? ───
let hasDenoCommand = false;
try {
  hasDenoCommand = typeof Deno.Command === "function";
} catch {
  hasDenoCommand = false;
}

// ─── Commands that can be executed via Deno.Command ───
const SUBPROCESS_COMMANDS = new Set([
  "node", "npm", "npx", "deno", "python", "python3", "pip", "pip3",
  "tsc", "bun", "bunx", "go", "cargo", "rustc",
  "gcc", "g++", "javac", "java", "ruby", "gem", "bundle",
  "php", "composer", "dart", "swift", "swiftc", "kotlinc",
  "Rscript", "solc", "cat", "ls", "find", "grep", "head", "tail",
  "wc", "sort", "uniq", "cut", "tr", "sed", "awk", "mkdir", "touch",
  "cp", "mv", "rm", "diff", "tree",
]);

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

// ─── Subprocess execution via Deno.Command ───
async function executeSubprocess(
  command: string,
  cwd: string,
  timeoutS: number,
  files?: Array<{ path: string; content: string }>
): Promise<{ stdout: string; stderr: string; exitCode: number; cwd: string; changedFiles?: Array<{ path: string; content: string }> }> {
  // Create a temp workspace if files are provided
  let workDir = cwd;
  let tempDir: string | null = null;

  if (files && files.length > 0) {
    tempDir = await Deno.makeTempDir({ prefix: "started-runner-" });
    workDir = tempDir;

    // Write project files to temp dir
    for (const f of files) {
      const filePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
      const fullPath = `${tempDir}/${filePath}`;
      const dir = fullPath.split("/").slice(0, -1).join("/");
      try {
        await Deno.mkdir(dir, { recursive: true });
      } catch { /* dir exists */ }
      await Deno.writeTextFile(fullPath, f.content);
    }
  }

  // Parse command into executable and args
  const parts = parseCommand(command);
  const executable = parts[0];
  const args = parts.slice(1);

  // Map tsc -> npx tsc
  let cmd: string[];
  if (executable === "tsc") {
    cmd = ["npx", "tsc", ...args];
  } else {
    cmd = [executable, ...args];
  }

  try {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutS * 1000);

    const process = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      cwd: workDir,
      stdout: "piped",
      stderr: "piped",
      signal: abortController.signal,
      env: {
        ...Object.fromEntries(
          ["PATH", "HOME", "USER", "SHELL", "LANG", "TERM", "NODE_PATH", "DENO_DIR"]
            .filter(k => Deno.env.get(k))
            .map(k => [k, Deno.env.get(k)!])
        ),
        NODE_ENV: "development",
        CI: "true",
      },
    });

    const output = await process.output();
    clearTimeout(timer);

    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);
    const exitCode = output.code;

    // Read back changed files if we used a temp dir
    let changedFiles: Array<{ path: string; content: string }> | undefined;
    if (tempDir && files) {
      changedFiles = await readChangedFiles(tempDir, files);
    }

    // Clean up temp dir
    if (tempDir) {
      try { await Deno.remove(tempDir, { recursive: true }); } catch { /* ignore */ }
    }

    return { stdout, stderr, exitCode, cwd: workDir === tempDir ? cwd : workDir, changedFiles };
  } catch (err) {
    // Clean up temp dir on error
    if (tempDir) {
      try { await Deno.remove(tempDir, { recursive: true }); } catch { /* ignore */ }
    }

    if (err instanceof DOMException && err.name === "AbortError") {
      return { stdout: "", stderr: `⚠ Command timed out after ${timeoutS}s\n`, exitCode: 124, cwd };
    }
    return { stdout: "", stderr: `⚠ Execution error: ${err instanceof Error ? err.message : String(err)}\n`, exitCode: 1, cwd };
  }
}

// Parse a command string into parts, respecting quotes
function parseCommand(cmd: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (inQuote) {
      if (ch === inQuote) { inQuote = null; }
      else { current += ch; }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === " " || ch === "\t") {
      if (current) { parts.push(current); current = ""; }
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// Read files that were modified in the temp workspace
async function readChangedFiles(
  tempDir: string,
  originalFiles: Array<{ path: string; content: string }>
): Promise<Array<{ path: string; content: string }>> {
  const changed: Array<{ path: string; content: string }> = [];
  const originalMap = new Map(originalFiles.map(f => [f.path.startsWith("/") ? f.path.slice(1) : f.path, f.content]));

  for (const [relPath, origContent] of originalMap) {
    try {
      const newContent = await Deno.readTextFile(`${tempDir}/${relPath}`);
      if (newContent !== origContent) {
        changed.push({ path: `/${relPath}`, content: newContent });
      }
    } catch { /* file deleted or unreadable */ }
  }

  // Check for new files (node_modules excluded)
  try {
    for await (const entry of walkDir(tempDir)) {
      const relPath = entry.slice(tempDir.length + 1);
      if (relPath.startsWith("node_modules/") || relPath.startsWith(".git/")) continue;
      if (!originalMap.has(relPath)) {
        try {
          const content = await Deno.readTextFile(entry);
          if (content.length < 100000) { // skip huge files
            changed.push({ path: `/${relPath}`, content });
          }
        } catch { /* skip binary/unreadable */ }
      }
    }
  } catch { /* ignore walk errors */ }

  return changed;
}

// Simple recursive file walker
async function* walkDir(dir: string): AsyncGenerator<string> {
  try {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isFile) yield path;
      else if (entry.isDirectory && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        yield* walkDir(path);
      }
    }
  } catch { /* ignore permission errors */ }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { command, cwd, timeout_s, project_id, files } = await req.json() as {
      command: string;
      cwd?: string;
      timeout_s?: number;
      project_id?: string;
      files?: Array<{ path: string; content: string }>;
    };

    if (!command) {
      return new Response(
        JSON.stringify({ error: "Missing 'command'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentCwd = cwd || "/workspace";
    const timeoutS = timeout_s || 60;
    const user = await getUser(req);
    const db = getServiceClient();

    // ─── Denylist check ───
    for (const pattern of DENIED_PATTERNS) {
      if (pattern.test(command)) {
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

    // ─── Real subprocess execution via Deno.Command ───
    const cmdParts = parseCommand(command);
    const executable = cmdParts[0];

    if (hasDenoCommand && SUBPROCESS_COMMANDS.has(executable)) {
      const result = await executeSubprocess(command, currentCwd, timeoutS, files);
      const durationMs = Date.now() - startTime;

      if (project_id && user?.id) {
        db.from("runs").insert({
          project_id, user_id: user.id, command,
          stdout: result.stdout.slice(0, 10000),
          stderr: result.stderr.slice(0, 10000),
          exit_code: result.exitCode,
          status: result.exitCode === 0 ? "success" : "failed",
        }).then(() => {}).catch(() => {});
      }

      // If we have changed files, return as JSON so frontend can merge
      if (result.changedFiles && result.changedFiles.length > 0) {
        return new Response(
          JSON.stringify({
            ok: result.exitCode === 0,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            cwd: result.cwd,
            durationMs,
            changedFiles: result.changedFiles,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Stream output
      const stream = new ReadableStream({
        start(controller) {
          if (result.stderr) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: result.stderr })}\n\n`));
          if (result.stdout) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stdout", data: result.stdout })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: result.exitCode, cwd: result.cwd, durationMs })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    // ─── Pipe/compound commands ───
    if (command.includes(" | ") || command.includes(" && ") || command.includes(" ; ")) {
      // Try to execute via shell if Deno.Command is available
      if (hasDenoCommand) {
        try {
          const result = await executeSubprocess(`sh -c ${JSON.stringify(command)}`, currentCwd, timeoutS, files);
          const durationMs = Date.now() - startTime;

          if (project_id && user?.id) {
            db.from("runs").insert({
              project_id, user_id: user.id, command,
              stdout: result.stdout.slice(0, 10000),
              stderr: result.stderr.slice(0, 10000),
              exit_code: result.exitCode,
              status: result.exitCode === 0 ? "success" : "failed",
            }).then(() => {}).catch(() => {});
          }

          const stream = new ReadableStream({
            start(controller) {
              if (result.stderr) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: result.stderr })}\n\n`));
              if (result.stdout) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stdout", data: result.stdout })}\n\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: result.exitCode, cwd: result.cwd, durationMs })}\n\n`));
              controller.close();
            },
          });
          return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
        } catch { /* fall through to error message */ }
      }

      const durationMs = Date.now() - startTime;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: "⚠ Pipe/compound commands are not fully supported in sandbox mode.\nTip: Run each command separately.\n" })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: 1, cwd: currentCwd, durationMs })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    // ─── Fallback: try Deno.Command for any unknown command ───
    if (hasDenoCommand) {
      try {
        const result = await executeSubprocess(command, currentCwd, timeoutS, files);
        const durationMs = Date.now() - startTime;

        if (project_id && user?.id) {
          db.from("runs").insert({
            project_id, user_id: user.id, command,
            stdout: result.stdout.slice(0, 10000),
            stderr: result.stderr.slice(0, 10000),
            exit_code: result.exitCode,
            status: result.exitCode === 0 ? "success" : "failed",
          }).then(() => {}).catch(() => {});
        }

        const stream = new ReadableStream({
          start(controller) {
            if (result.stderr) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: result.stderr })}\n\n`));
            if (result.stdout) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stdout", data: result.stdout })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: result.exitCode, cwd: result.cwd, durationMs })}\n\n`));
            controller.close();
          },
        });
        return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
      } catch { /* fall through to sandbox fallback */ }
    }

    // ─── Sandbox fallback: command not available ───
    const durationMs = Date.now() - startTime;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: `$ ${command}\nbash: ${cmdParts[0]}: command not found\n\nThis command is not available in the current runner environment.\nBuilt-in support: echo, pwd, date, node -e, python -c, ruby -e, php -r\nSubprocess support: node, npm, npx, deno, python, go, cargo, gcc, and more.\n` })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: 127, cwd: currentCwd, durationMs })}\n\n`));
        controller.close();
      },
    });

    if (project_id && user?.id) {
      db.from("runs").insert({ project_id, user_id: user.id, command, stderr: `command not found: ${cmdParts[0]}`, exit_code: 127, status: "failed" }).then(() => {}).catch(() => {});
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