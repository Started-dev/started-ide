import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Hashing ───

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
  return (
    "{" +
    sorted
      .map((k) => JSON.stringify(k) + ":" + canonicalJSON((obj as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

// ─── Path validation ───

function validatePath(p: string): boolean {
  if (p.includes("..")) return false;
  if (p.startsWith("/") && p.length > 1) return true;
  if (!p.startsWith("/")) return true;
  return true;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/");
}

// ─── Auth ───

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Build tree from flat file list ───

interface TreeEntry {
  name: string;
  type: "blob" | "tree";
  hash: string;
}

async function buildMerkleDAG(
  db: ReturnType<typeof createClient>,
  files: Array<{ path: string; content: string }>
): Promise<{ rootHash: string; blobHashes: Map<string, string>; treeHashes: Map<string, string> }> {
  const blobHashes = new Map<string, string>();
  const treeHashes = new Map<string, string>();

  // 1. Hash and insert all blobs
  const blobInserts: Array<{ hash: string; byte_size: number; content: string }> = [];
  for (const f of files) {
    const path = normalizePath(f.path);
    const hash = await sha256(f.content);
    blobHashes.set(path, hash);
    blobInserts.push({ hash, byte_size: new TextEncoder().encode(f.content).length, content: f.content });
  }

  // Deduplicate blobs
  const uniqueBlobs = new Map<string, typeof blobInserts[0]>();
  for (const b of blobInserts) uniqueBlobs.set(b.hash, b);

  if (uniqueBlobs.size > 0) {
    // Upsert blobs (ignore conflicts on hash PK)
    const { error } = await db.from("ca_blobs").upsert(
      Array.from(uniqueBlobs.values()),
      { onConflict: "hash", ignoreDuplicates: true }
    );
    if (error) console.error("Blob upsert error:", error);
  }

  // 2. Build directory structure
  interface DirNode {
    children: Map<string, DirNode>;
    files: Map<string, string>; // name -> blob hash
  }

  const root: DirNode = { children: new Map(), files: new Map() };

  for (const f of files) {
    const path = normalizePath(f.path).replace(/^\//, "");
    const parts = path.split("/");
    const fileName = parts.pop()!;
    let current = root;
    for (const dir of parts) {
      if (!current.children.has(dir)) {
        current.children.set(dir, { children: new Map(), files: new Map() });
      }
      current = current.children.get(dir)!;
    }
    current.files.set(fileName, blobHashes.get(normalizePath(f.path))!);
  }

  // 3. Recursively hash trees (bottom-up)
  async function hashTree(node: DirNode, dirPath: string): Promise<string> {
    const entries: TreeEntry[] = [];

    // Files
    for (const [name, hash] of node.files) {
      entries.push({ name, type: "blob", hash });
    }

    // Sub-directories
    for (const [name, child] of node.children) {
      const childHash = await hashTree(child, `${dirPath}/${name}`);
      entries.push({ name, type: "tree", hash: childHash });
    }

    // Sort by name for canonical ordering
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const canonical = canonicalJSON(entries);
    const hash = await sha256(canonical);
    treeHashes.set(dirPath || "/", hash);

    // Insert tree
    await db.from("ca_trees").upsert(
      { hash, entries },
      { onConflict: "hash", ignoreDuplicates: true }
    );

    return hash;
  }

  const rootHash = await hashTree(root, "");
  return { rootHash, blobHashes, treeHashes };
}

// ─── Checkout: flatten a snapshot into file list ───

async function checkoutSnapshot(
  db: ReturnType<typeof createClient>,
  snapshotId: string
): Promise<Array<{ path: string; content: string }>> {
  // Fast path: use path index
  const { data: indexed } = await db
    .from("ca_path_index")
    .select("path, blob_hash")
    .eq("snapshot_id", snapshotId);

  if (indexed && indexed.length > 0) {
    const hashes = [...new Set(indexed.map((i) => i.blob_hash))];
    const { data: blobs } = await db
      .from("ca_blobs")
      .select("hash, content")
      .in("hash", hashes);

    const blobMap = new Map((blobs || []).map((b) => [b.hash, b.content]));
    return indexed.map((i) => ({
      path: i.path,
      content: blobMap.get(i.blob_hash) || "",
    }));
  }

  // Slow path: walk tree
  const { data: snapshot } = await db
    .from("ca_snapshots")
    .select("root_tree_hash")
    .eq("id", snapshotId)
    .single();

  if (!snapshot) return [];

  const files: Array<{ path: string; content: string }> = [];

  async function walkTree(treeHash: string, prefix: string) {
    const { data: tree } = await db
      .from("ca_trees")
      .select("entries")
      .eq("hash", treeHash)
      .single();

    if (!tree) return;
    const entries = tree.entries as TreeEntry[];

    for (const entry of entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : `/${entry.name}`;
      if (entry.type === "blob") {
        const { data: blob } = await db
          .from("ca_blobs")
          .select("content")
          .eq("hash", entry.hash)
          .single();
        if (blob) files.push({ path: fullPath, content: blob.content });
      } else {
        await walkTree(entry.hash, fullPath);
      }
    }
  }

  await walkTree(snapshot.root_tree_hash, "");
  return files;
}

// ─── Diff between two snapshots ───

async function diffSnapshots(
  db: ReturnType<typeof createClient>,
  oldSnapshotId: string,
  newSnapshotId: string
): Promise<{ added: string[]; modified: string[]; deleted: string[] }> {
  const oldFiles = await checkoutSnapshot(db, oldSnapshotId);
  const newFiles = await checkoutSnapshot(db, newSnapshotId);

  const oldMap = new Map(oldFiles.map((f) => [f.path, f.content]));
  const newMap = new Map(newFiles.map((f) => [f.path, f.content]));

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [path, content] of newMap) {
    if (!oldMap.has(path)) added.push(path);
    else if (oldMap.get(path) !== content) modified.push(path);
  }

  for (const path of oldMap.keys()) {
    if (!newMap.has(path)) deleted.push(path);
  }

  return { added, modified, deleted };
}

// ─── Emit project event ───

async function emitEvent(
  db: ReturnType<typeof createClient>,
  projectId: string,
  eventType: string,
  payload: Record<string, unknown>,
  actorType: string,
  actorId?: string
) {
  await db.from("project_events").insert({
    project_id: projectId,
    actor_type: actorType,
    actor_id: actorId || null,
    event_type: eventType,
    payload,
  });
}

// ─── Main Handler ───

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (await req.json().then((b) => b.action).catch(() => ""));
    const body = req.method === "POST" ? await req.clone().json().catch(() => ({})) : {};
    const db = getServiceClient();

    switch (action) {
      // ─── Create snapshot from files ───
      case "create_snapshot": {
        const { project_id, files, label, ref_name } = body;
        if (!project_id || !files) return json({ error: "Missing project_id or files" }, 400);

        // Validate paths
        for (const f of files) {
          if (!validatePath(f.path)) return json({ error: `Invalid path: ${f.path}` }, 400);
        }

        // Get current ref for parent pointer
        const { data: currentRef } = await db
          .from("ca_refs")
          .select("snapshot_id")
          .eq("project_id", project_id)
          .eq("ref_name", ref_name || "main")
          .single();

        // Build Merkle DAG
        const { rootHash, blobHashes } = await buildMerkleDAG(db, files);

        // Create snapshot
        const { data: snapshot, error: snapErr } = await db
          .from("ca_snapshots")
          .insert({
            project_id,
            root_tree_hash: rootHash,
            parent_snapshot_id: currentRef?.snapshot_id || null,
            label: label || "Snapshot",
            created_by: user.id,
          })
          .select("id")
          .single();

        if (snapErr) return json({ error: snapErr.message }, 500);

        // Build path index
        const pathEntries = files.map((f: { path: string }) => ({
          project_id,
          snapshot_id: snapshot.id,
          path: normalizePath(f.path),
          blob_hash: blobHashes.get(normalizePath(f.path))!,
        }));

        if (pathEntries.length > 0) {
          await db.from("ca_path_index").insert(pathEntries);
        }

        // Update ref
        await db.from("ca_refs").upsert(
          {
            project_id,
            ref_name: ref_name || "main",
            snapshot_id: snapshot.id,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,ref_name" }
        );

        // Emit event
        await emitEvent(db, project_id, "snapshot.created", {
          snapshot_id: snapshot.id,
          root_tree_hash: rootHash,
          file_count: files.length,
          label,
        }, "user", user.id);

        return json({ ok: true, snapshot_id: snapshot.id, root_tree_hash: rootHash });
      }

      // ─── Checkout snapshot ───
      case "checkout": {
        const { snapshot_id, project_id, ref_name } = body;
        let targetSnapshotId = snapshot_id;

        if (!targetSnapshotId && project_id) {
          const { data: ref } = await db
            .from("ca_refs")
            .select("snapshot_id")
            .eq("project_id", project_id)
            .eq("ref_name", ref_name || "main")
            .single();
          targetSnapshotId = ref?.snapshot_id;
        }

        if (!targetSnapshotId) return json({ error: "No snapshot found" }, 404);

        const files = await checkoutSnapshot(db, targetSnapshotId);
        return json({ ok: true, snapshot_id: targetSnapshotId, files });
      }

      // ─── Diff two snapshots ───
      case "diff": {
        const { old_snapshot_id, new_snapshot_id } = body;
        if (!old_snapshot_id || !new_snapshot_id) return json({ error: "Missing snapshot IDs" }, 400);

        const diff = await diffSnapshots(db, old_snapshot_id, new_snapshot_id);
        return json({ ok: true, diff });
      }

      // ─── Apply patch (creates new snapshot) ───
      case "apply_patch": {
        const { project_id, diff, ref_name } = body;
        if (!project_id || !diff) return json({ error: "Missing project_id or diff" }, 400);

        // Checkout current
        const { data: currentRef } = await db
          .from("ca_refs")
          .select("snapshot_id")
          .eq("project_id", project_id)
          .eq("ref_name", ref_name || "main")
          .single();

        if (!currentRef) return json({ error: "No current snapshot for ref" }, 404);

        const currentFiles = await checkoutSnapshot(db, currentRef.snapshot_id);

        // Parse and apply diff (reuse existing apply-patch logic inline)
        const patches = parseUnifiedDiff(diff);
        if (patches.length === 0) return json({ error: "No valid patches" }, 400);

        const updatedFiles = [...currentFiles];
        const changedPaths: string[] = [];

        for (const patch of patches) {
          const isNew = patch.oldFile === "/dev/null";
          if (isNew) {
            const content = patch.hunks
              .flatMap((h) => h.lines.filter((l) => l.type === "add").map((l) => l.content))
              .join("\n");
            const path = patch.newFile.startsWith("/") ? patch.newFile : `/${patch.newFile}`;
            updatedFiles.push({ path, content });
            changedPaths.push(path);
          } else {
            const targetPath = patch.newFile.startsWith("/") ? patch.newFile : `/${patch.newFile}`;
            const idx = updatedFiles.findIndex((f) => f.path === targetPath);
            if (idx === -1) continue;
            const newContent = applyHunks(updatedFiles[idx].content, patch.hunks);
            if (newContent !== null) {
              updatedFiles[idx] = { ...updatedFiles[idx], content: newContent };
              changedPaths.push(targetPath);
            }
          }
        }

        // Create new snapshot from updated files
        const { rootHash, blobHashes } = await buildMerkleDAG(db, updatedFiles);

        const { data: newSnapshot } = await db
          .from("ca_snapshots")
          .insert({
            project_id,
            root_tree_hash: rootHash,
            parent_snapshot_id: currentRef.snapshot_id,
            label: `Patch: ${changedPaths.length} files`,
            created_by: user.id,
          })
          .select("id")
          .single();

        if (!newSnapshot) return json({ error: "Failed to create snapshot" }, 500);

        // Path index
        const pathEntries = updatedFiles.map((f) => ({
          project_id,
          snapshot_id: newSnapshot.id,
          path: normalizePath(f.path),
          blob_hash: blobHashes.get(normalizePath(f.path))!,
        }));
        if (pathEntries.length > 0) await db.from("ca_path_index").insert(pathEntries);

        // Update ref
        await db.from("ca_refs").upsert({
          project_id,
          ref_name: ref_name || "main",
          snapshot_id: newSnapshot.id,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "project_id,ref_name" });

        // Emit event
        await emitEvent(db, project_id, "patch.applied", {
          snapshot_id: newSnapshot.id,
          changed_paths: changedPaths,
          parent_snapshot_id: currentRef.snapshot_id,
        }, "user", user.id);

        return json({
          ok: true,
          snapshot_id: newSnapshot.id,
          changed_paths: changedPaths,
          files: updatedFiles,
        });
      }

      // ─── List refs ───
      case "list_refs": {
        const { project_id } = body;
        if (!project_id) return json({ error: "Missing project_id" }, 400);

        const { data: refs } = await db
          .from("ca_refs")
          .select("ref_name, snapshot_id, updated_at, updated_by")
          .eq("project_id", project_id);

        return json({ ok: true, refs: refs || [] });
      }

      // ─── Snapshot history ───
      case "history": {
        const { project_id, limit } = body;
        if (!project_id) return json({ error: "Missing project_id" }, 400);

        const { data: snapshots } = await db
          .from("ca_snapshots")
          .select("id, root_tree_hash, parent_snapshot_id, label, created_by, created_at")
          .eq("project_id", project_id)
          .order("created_at", { ascending: false })
          .limit(limit || 50);

        return json({ ok: true, snapshots: snapshots || [] });
      }

      // ─── Merge agent ref into main ───
      case "merge_ref": {
        const { project_id, source_ref, target_ref } = body;
        if (!project_id || !source_ref) return json({ error: "Missing fields" }, 400);

        const targetRefName = target_ref || "main";

        const { data: sourceRef } = await db
          .from("ca_refs")
          .select("snapshot_id")
          .eq("project_id", project_id)
          .eq("ref_name", source_ref)
          .single();

        if (!sourceRef) return json({ error: "Source ref not found" }, 404);

        // Fast-forward: just update main to point to source snapshot
        await db.from("ca_refs").upsert({
          project_id,
          ref_name: targetRefName,
          snapshot_id: sourceRef.snapshot_id,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "project_id,ref_name" });

        await emitEvent(db, project_id, "ref.merged", {
          source_ref: source_ref,
          target_ref: targetRefName,
          snapshot_id: sourceRef.snapshot_id,
        }, "user", user.id);

        return json({ ok: true, merged_snapshot_id: sourceRef.snapshot_id });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("snapshot-api error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

// ─── Minimal diff parser (same logic as apply-patch) ───

interface DiffLine { type: "context" | "add" | "remove"; content: string; }
interface DiffHunk { oldStart: number; oldCount: number; newStart: number; newCount: number; lines: DiffLine[]; }
interface ParsedPatch { oldFile: string; newFile: string; hunks: DiffHunk[]; }

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
              oldStart: parseInt(m[1], 10), oldCount: parseInt(m[2] ?? "1", 10),
              newStart: parseInt(m[3], 10), newCount: parseInt(m[4] ?? "1", 10),
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

function applyHunks(content: string, hunks: DiffHunk[]): string | null {
  const lines = content.split("\n");
  const sorted = [...hunks].sort((a, b) => b.oldStart - a.oldStart);
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
