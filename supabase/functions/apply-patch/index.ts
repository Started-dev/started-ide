import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DiffLine {
  type: "context" | "add" | "remove";
  content: string;
}

interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

interface ParsedPatch {
  oldFile: string;
  newFile: string;
  hunks: DiffHunk[];
}

interface FileEntry {
  path: string;
  content: string;
}

function parseUnifiedDiff(raw: string): ParsedPatch[] {
  const patches: ParsedPatch[] = [];
  const lines = raw.split("\n");
  let i = 0;

  while (i < lines.length) {
    if (lines[i]?.startsWith("---")) {
      const oldFile = lines[i].replace(/^---\s+(a\/)?/, "").trim();
      i++;
      if (i >= lines.length || !lines[i]?.startsWith("+++")) { i++; continue; }
      const newFile = lines[i].replace(/^\+\+\+\s+(b\/)?/, "").trim();
      i++;
      const hunks: DiffHunk[] = [];

      while (i < lines.length && !lines[i]?.startsWith("---")) {
        if (lines[i]?.startsWith("@@")) {
          const m = lines[i].match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
          if (m) {
            const hunk: DiffHunk = {
              oldStart: parseInt(m[1], 10),
              oldCount: parseInt(m[2] ?? "1", 10),
              newStart: parseInt(m[3], 10),
              newCount: parseInt(m[4] ?? "1", 10),
              lines: [],
            };
            i++;
            while (i < lines.length && !lines[i]?.startsWith("@@") && !lines[i]?.startsWith("---")) {
              const line = lines[i];
              if (line.startsWith("+")) hunk.lines.push({ type: "add", content: line.slice(1) });
              else if (line.startsWith("-")) hunk.lines.push({ type: "remove", content: line.slice(1) });
              else if (line.startsWith(" ") || line === "") hunk.lines.push({ type: "context", content: line.startsWith(" ") ? line.slice(1) : line });
              else break;
              i++;
            }
            hunks.push(hunk);
          } else { i++; }
        } else { i++; }
      }
      if (hunks.length > 0) patches.push({ oldFile, newFile, hunks });
    } else { i++; }
  }
  return patches;
}

function applyPatchToContent(content: string, patch: ParsedPatch): string | null {
  const lines = content.split("\n");
  const sorted = [...patch.hunks].sort((a, b) => b.oldStart - a.oldStart);

  for (const hunk of sorted) {
    const startIdx = hunk.oldStart - 1;
    const newLines: string[] = [];
    for (const line of hunk.lines) {
      if (line.type === "add" || line.type === "context") newLines.push(line.content);
    }
    lines.splice(startIdx, hunk.oldCount, ...newLines);
  }
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { diff, files } = (await req.json()) as {
      diff: string;
      files: FileEntry[];
    };

    if (!diff || !files) {
      return new Response(
        JSON.stringify({ error: "Missing 'diff' or 'files' in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const patches = parseUnifiedDiff(diff);
    if (patches.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid patches found in diff" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create snapshot before applying
    const snapshot = files.map((f) => ({ ...f }));
    const results: Array<{ path: string; status: "applied" | "created" | "failed"; error?: string }> = [];
    const updatedFiles = [...files];

    for (const patch of patches) {
      const isNewFile = patch.oldFile === "/dev/null";

      if (isNewFile) {
        const newContent = patch.hunks
          .flatMap((h) => h.lines.filter((l) => l.type === "add").map((l) => l.content))
          .join("\n");
        const path = patch.newFile.startsWith("/") ? patch.newFile : `/${patch.newFile}`;
        updatedFiles.push({ path, content: newContent });
        results.push({ path, status: "created" });
      } else {
        const targetPath = patch.newFile.startsWith("/") ? patch.newFile : `/${patch.newFile}`;
        const fileIdx = updatedFiles.findIndex((f) => f.path === targetPath);

        if (fileIdx === -1) {
          results.push({ path: targetPath, status: "failed", error: "File not found" });
          continue;
        }

        const newContent = applyPatchToContent(updatedFiles[fileIdx].content, patch);
        if (newContent === null) {
          results.push({ path: targetPath, status: "failed", error: "Hunk could not be applied" });
          continue;
        }

        updatedFiles[fileIdx] = { ...updatedFiles[fileIdx], content: newContent };
        results.push({ path: targetPath, status: "applied" });
      }
    }

    const allOk = results.every((r) => r.status !== "failed");

    return new Response(
      JSON.stringify({
        success: allOk,
        results,
        updatedFiles: allOk ? updatedFiles : undefined,
        snapshot: allOk ? undefined : snapshot,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("apply-patch error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
