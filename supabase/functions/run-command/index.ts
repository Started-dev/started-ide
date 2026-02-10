import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Denylist for dangerous commands
const DENIED_PATTERNS = [
  /^rm\s+-rf\s+[\/~]/,
  /^sudo\s/,
  /^dd\s/,
  /^mkfs/,
  /^chmod\s+777/,
  /^ssh\s/,
  /^cat\s+\/etc\/(passwd|shadow)/,
  /^cat\s+~\/\.ssh/,
];

// Shell builtins we can implement natively in Deno
function executeBuiltin(cmd: string, cwd: string): { handled: boolean; stdout?: string; stderr?: string; exitCode?: number; newCwd?: string } {
  const parts = cmd.split(/\s+/);
  const bin = parts[0];

  switch (bin) {
    case "echo":
      return { handled: true, stdout: parts.slice(1).join(" ") + "\n", exitCode: 0 };

    case "pwd":
      return { handled: true, stdout: cwd + "\n", exitCode: 0 };

    case "date":
      return { handled: true, stdout: new Date().toISOString() + "\n", exitCode: 0 };

    case "whoami":
      return { handled: true, stdout: "runner\n", exitCode: 0 };

    case "hostname":
      return { handled: true, stdout: "started-runner\n", exitCode: 0 };

    case "uname": {
      const flag = parts[1] || "";
      if (flag === "-a") return { handled: true, stdout: "Deno 1.x (Started Runner) aarch64\n", exitCode: 0 };
      return { handled: true, stdout: "Deno\n", exitCode: 0 };
    }

    case "which": {
      const target = parts[1];
      if (!target) return { handled: true, stderr: "which: missing argument\n", exitCode: 1 };
      const available = ["node", "deno", "npx", "npm", "echo", "pwd", "date", "cat", "ls", "env", "which", "whoami", "hostname", "uname", "true", "false", "sleep", "printf", "test", "expr"];
      if (available.includes(target)) return { handled: true, stdout: `/usr/bin/${target}\n`, exitCode: 0 };
      return { handled: true, stderr: `which: ${target}: not found\n`, exitCode: 1 };
    }

    case "env": {
      // Show safe env vars only
      const safeVars = { DENO_VERSION: Deno.version.deno, TS_VERSION: Deno.version.typescript, V8_VERSION: Deno.version.v8, HOME: "/home/runner", USER: "runner", SHELL: "/bin/sh", PWD: cwd };
      const out = Object.entries(safeVars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
      return { handled: true, stdout: out, exitCode: 0 };
    }

    case "true":
      return { handled: true, stdout: "", exitCode: 0 };

    case "false":
      return { handled: true, stdout: "", exitCode: 1 };

    case "printf": {
      const fmt = parts.slice(1).join(" ").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
      return { handled: true, stdout: fmt, exitCode: 0 };
    }

    case "sleep": {
      // Can't actually sleep in edge function, but acknowledge it
      const secs = parseFloat(parts[1] || "0");
      return { handled: true, stdout: `(slept ${secs}s)\n`, exitCode: 0 };
    }

    case "expr": {
      try {
        const expression = parts.slice(1).join(" ");
        // Simple arithmetic only
        const safeExpr = expression.replace(/[^0-9+\-*/%() ]/g, "");
        const result = Function(`"use strict"; return (${safeExpr})`)();
        return { handled: true, stdout: String(result) + "\n", exitCode: 0 };
      } catch {
        return { handled: true, stderr: "expr: syntax error\n", exitCode: 2 };
      }
    }

    case "head":
    case "tail":
    case "wc":
    case "sort":
    case "uniq":
    case "tr":
    case "cut":
    case "grep":
    case "sed":
    case "awk":
    case "seq": {
      // These need stdin or file input — can be partially handled
      if (bin === "seq") {
        const nums: number[] = parts.slice(1).map(Number).filter(n => !isNaN(n));
        if (nums.length === 1) {
          return { handled: true, stdout: Array.from({ length: nums[0] }, (_, i) => i + 1).join("\n") + "\n", exitCode: 0 };
        }
        if (nums.length === 2) {
          const out: number[] = [];
          for (let i = nums[0]; i <= nums[1]; i++) out.push(i);
          return { handled: true, stdout: out.join("\n") + "\n", exitCode: 0 };
        }
      }
      return { handled: false };
    }

    default:
      return { handled: false };
  }
}

// Execute JavaScript/TypeScript code using Deno eval
async function executeJSCode(code: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const logs: string[] = [];
  const errors: string[] = [];

  // Create a sandboxed console
  const fakeConsole = {
    log: (...args: unknown[]) => logs.push(args.map(a => typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)).join(" ")),
    error: (...args: unknown[]) => errors.push(args.map(a => typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)).join(" ")),
    warn: (...args: unknown[]) => logs.push("[warn] " + args.map(a => String(a)).join(" ")),
    info: (...args: unknown[]) => logs.push("[info] " + args.map(a => String(a)).join(" ")),
    table: (data: unknown) => logs.push(JSON.stringify(data, null, 2)),
    dir: (obj: unknown) => logs.push(JSON.stringify(obj, null, 2)),
    time: () => {},
    timeEnd: () => {},
    assert: (cond: unknown, ...args: unknown[]) => { if (!cond) errors.push("Assertion failed: " + args.join(" ")); },
  };

  try {
    const fn = new Function("console", "Math", "JSON", "Date", "Array", "Object", "String", "Number", "Boolean", "RegExp", "Map", "Set", "Promise", "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent", "setTimeout",
      `"use strict";\n${code}`
    );
    const result = fn(fakeConsole, Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp, Map, Set, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, () => {});
    // If the code returns a value, log it
    if (result !== undefined) {
      logs.push(typeof result === "object" ? JSON.stringify(result, null, 2) : String(result));
    }
    return { stdout: logs.join("\n") + (logs.length ? "\n" : ""), stderr: errors.join("\n") + (errors.length ? "\n" : ""), exitCode: errors.length > 0 ? 1 : 0 };
  } catch (err) {
    return { stdout: logs.join("\n") + (logs.length ? "\n" : ""), stderr: (err instanceof Error ? `${err.name}: ${err.message}` : String(err)) + "\n", exitCode: 1 };
  }
}

// Execute Python-like code using basic interpreter
function executePythonLike(code: string): { stdout: string; stderr: string; exitCode: number } {
  const lines: string[] = [];
  try {
    // Very basic: handle print() statements
    const printRegex = /^print\s*\((.+)\)\s*$/;
    for (const line of code.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const m = trimmed.match(printRegex);
      if (m) {
        try {
          // Evaluate the argument (handles strings, numbers, basic expressions)
          const arg = m[1].trim();
          // Handle f-strings and simple strings
          const val = Function(`"use strict"; return (${arg.replace(/^f"/,'("').replace(/^f'/,"('")})`)();
          lines.push(String(val));
        } catch {
          lines.push(m[1].replace(/^["']|["']$/g, ""));
        }
      } else if (trimmed.match(/^\w+\s*=\s*.+$/)) {
        // Variable assignment - skip silently
      } else {
        // Try evaluating as expression
        try {
          const val = Function(`"use strict"; return (${trimmed})`)();
          if (val !== undefined) lines.push(String(val));
        } catch {
          return { stdout: lines.join("\n") + "\n", stderr: `SyntaxError: unsupported Python syntax: ${trimmed}\n\nNote: Full Python execution requires a Python runtime. The terminal can evaluate basic expressions and print statements.\n`, exitCode: 1 };
        }
      }
    }
    return { stdout: lines.join("\n") + (lines.length ? "\n" : ""), stderr: "", exitCode: 0 };
  } catch (err) {
    return { stdout: lines.join("\n") + "\n", stderr: (err instanceof Error ? err.message : String(err)) + "\n", exitCode: 1 };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { command, cwd, timeout_s } = (await req.json()) as {
      command: string;
      cwd?: string;
      timeout_s?: number;
    };

    if (!command) {
      return new Response(
        JSON.stringify({ error: "Missing 'command'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentCwd = cwd || "/workspace";

    // Check denylist
    for (const pattern of DENIED_PATTERNS) {
      if (pattern.test(command)) {
        return new Response(
          JSON.stringify({
            ok: false, stdout: "", stderr: `⛔ Command denied by security policy: ${command}`,
            exitCode: 1, cwd: currentCwd, durationMs: 0,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Handle cd commands
    if (command.startsWith("cd ")) {
      const target = command.slice(3).trim();
      let newCwd = currentCwd;
      if (target.startsWith("/")) newCwd = target;
      else if (target === "..") {
        const parts = currentCwd.split("/").filter(Boolean);
        parts.pop();
        newCwd = "/" + parts.join("/");
      } else if (target === "~") {
        newCwd = "/home/runner";
      } else {
        newCwd = currentCwd === "/" ? `/${target}` : `${currentCwd}/${target}`;
      }
      return new Response(
        JSON.stringify({ ok: true, stdout: "", stderr: "", exitCode: 0, cwd: newCwd, durationMs: 5 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startTime = Date.now();
    const encoder = new TextEncoder();

    // Try shell builtins first
    const builtin = executeBuiltin(command, currentCwd);
    if (builtin.handled) {
      const durationMs = Date.now() - startTime;
      const stream = new ReadableStream({
        start(controller) {
          if (builtin.stderr) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: builtin.stderr })}\n\n`));
          }
          if (builtin.stdout) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stdout", data: builtin.stdout })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: builtin.exitCode ?? 0, cwd: builtin.newCwd || currentCwd, durationMs })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    // Detect inline JavaScript/TypeScript execution: node -e "..." or deno eval "..."
    const nodeEvalMatch = command.match(/^(?:node|deno)\s+(?:-e|eval)\s+["'](.+)["']$/s);
    if (nodeEvalMatch) {
      const result = await executeJSCode(nodeEvalMatch[1]);
      const durationMs = Date.now() - startTime;
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

    // Detect python -c "..."
    const pythonEvalMatch = command.match(/^python[3]?\s+-c\s+["'](.+)["']$/s);
    if (pythonEvalMatch) {
      const result = executePythonLike(pythonEvalMatch[1]);
      const durationMs = Date.now() - startTime;
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

    // Detect piped commands / compound commands with basic support
    if (command.includes(" | ") || command.includes(" && ") || command.includes(" ; ")) {
      // Execute first part, acknowledge the rest
      const durationMs = Date.now() - startTime;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: `⚠ Pipe/compound commands are not fully supported in this environment.\nTip: Run each command separately for best results.\n` })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: 1, cwd: currentCwd, durationMs })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    // For unsupported commands - give helpful feedback
    const cmd = command.trim().split(/\s+/)[0];
    const packageManagers = ["npm", "pnpm", "yarn", "pip", "pip3", "cargo", "go", "gem", "composer", "maven", "gradle"];
    const serverCommands = ["npm start", "npm run dev", "node server", "python -m http.server", "python manage.py runserver", "flask run", "rails server", "cargo run", "go run"];
    const buildTools = ["npm run build", "pnpm build", "tsc", "webpack", "vite build", "esbuild", "rollup"];
    const testRunners = ["npm test", "pnpm test", "pytest", "jest", "vitest", "mocha", "cargo test", "go test"];

    let helpText = "";
    if (packageManagers.includes(cmd)) {
      helpText = `ℹ Package management commands require a full runtime environment.\n  This terminal runs in a serverless Deno environment.\n\n  To use ${cmd}, connect a runner service or use a local development environment.\n`;
    } else if (serverCommands.some(sc => command.startsWith(sc))) {
      helpText = `ℹ Server commands require a full runtime environment with persistent processes.\n  This terminal runs in a serverless environment.\n\n  To start a dev server, connect a runner service or use a local development environment.\n`;
    } else if (buildTools.some(bt => command.startsWith(bt))) {
      helpText = `ℹ Build tools require a full runtime environment with file system access.\n  This terminal runs in a serverless Deno environment.\n\n  To run builds, connect a runner service or use a local development environment.\n`;
    } else if (testRunners.some(tr => command.startsWith(tr))) {
      helpText = `ℹ Test runners require a full runtime environment.\n  This terminal runs in a serverless Deno environment.\n\n  To run tests, connect a runner service or use a local development environment.\n`;
    } else {
      helpText = `ℹ '${cmd}' is not available in this environment.\n\n  Available commands:\n  • Shell builtins: echo, pwd, date, whoami, hostname, uname, which, env, expr, seq, printf, sleep\n  • JS/TS eval: node -e "code" or deno eval "code"\n  • Python eval: python -c "code"\n\n  For full command support, connect a runner service.\n`;
    }

    const durationMs = Date.now() - startTime;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: helpText })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", exitCode: 127, cwd: currentCwd, durationMs })}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("run-command error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
