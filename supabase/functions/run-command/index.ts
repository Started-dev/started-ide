import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Simulated command outputs for the MVP (would call real Runner service in production)
const COMMAND_OUTPUTS: Record<string, { stdout: string; exitCode: number; durationMs: number }> = {
  "npm test": {
    stdout: "> demo-project@1.0.0 test\n> jest\n\nPASS src/utils.test.ts\n  greet\n    ✓ should greet with name (2ms)\n  add\n    ✓ should add two numbers (1ms)\n    ✓ should handle negative numbers\n\nTest Suites: 1 passed, 1 total\nTests:       3 passed, 3 total\nTime:        1.234s\n",
    exitCode: 0,
    durationMs: 1234,
  },
  "npm run build": {
    stdout: "> demo-project@1.0.0 build\n> tsc\n\nCompilation complete. 0 errors.\n",
    exitCode: 0,
    durationMs: 2100,
  },
  "npm run lint": {
    stdout: "> demo-project@1.0.0 lint\n> eslint src/**/*.ts\n\n✓ No issues found\n",
    exitCode: 0,
    durationMs: 800,
  },
  "npm start": {
    stdout: "> demo-project@1.0.0 start\n> ts-node src/main.ts\n\nHello, World! Welcome to Claude Code.\nClaude Code Cloud IDE is running!\n",
    exitCode: 0,
    durationMs: 500,
  },
  "git status": {
    stdout: "On branch main\nChanges not staged for commit:\n  modified:   src/utils.ts\n\nno changes added to commit\n",
    exitCode: 0,
    durationMs: 50,
  },
};

// Denylist for dangerous commands
const DENIED_PATTERNS = [
  /^rm\s+-rf\s+[\/~]/,
  /^sudo\s/,
  /^dd\s/,
  /^mkfs/,
  /^chmod\s+777/,
  /^curl\s/,
  /^wget\s/,
  /^ssh\s/,
  /^cat\s+\/etc\//,
  /^cat\s+~\/\.ssh/,
  /^env\s/,
  /^export\s/,
];

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

    // Check denylist
    for (const pattern of DENIED_PATTERNS) {
      if (pattern.test(command)) {
        return new Response(
          JSON.stringify({
            ok: false,
            stdout: "",
            stderr: `⛔ Command denied by security policy: ${command}`,
            exitCode: 1,
            cwd: cwd || "/workspace",
            durationMs: 0,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // SSE streaming simulation
    const encoder = new TextEncoder();
    let currentCwd = cwd || "/workspace";

    // Handle cd commands
    if (command.startsWith("cd ")) {
      const target = command.slice(3).trim();
      if (target.startsWith("/")) currentCwd = target;
      else if (target === "..") {
        const parts = currentCwd.split("/").filter(Boolean);
        parts.pop();
        currentCwd = "/" + parts.join("/");
      } else {
        currentCwd = currentCwd === "/" ? `/${target}` : `${currentCwd}/${target}`;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          stdout: "",
          stderr: "",
          exitCode: 0,
          cwd: currentCwd,
          durationMs: 5,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check known commands
    const known = COMMAND_OUTPUTS[command];
    if (known) {
      // Stream output via SSE
      const stream = new ReadableStream({
        start(controller) {
          const lines = known.stdout.split("\n");
          let i = 0;

          const interval = setInterval(() => {
            if (i < lines.length) {
              const data = JSON.stringify({ type: "stdout", data: lines[i] + "\n" });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              i++;
            } else {
              const done = JSON.stringify({
                type: "done",
                exitCode: known.exitCode,
                cwd: currentCwd,
                durationMs: known.durationMs,
              });
              controller.enqueue(encoder.encode(`data: ${done}\n\n`));
              controller.close();
              clearInterval(interval);
            }
          }, 50);
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Generic unknown command - simulate
    const stream = new ReadableStream({
      start(controller) {
        const output = `$ ${command}\n> Command executed in ${currentCwd}\n> (simulated output)\n`;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "stdout", data: output })}\n\n`)
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", exitCode: 0, cwd: currentCwd, durationMs: 100 })}\n\n`
          )
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("run-command error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
