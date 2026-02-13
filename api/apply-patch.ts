/**
 * Apply patch endpoint
 * Applies a unified diff to a set of files
 */
import type { VercelRequest, VercelResponse } from './_lib/vercel-types';
import { handleOptions } from './_lib/cors';
import { requireAuth } from './_lib/auth';
import { applyPatchToContent, buildContentFromNewFilePatch, parseUnifiedDiff } from './_lib/patch';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { diff, files } = req.body || {};
    if (!diff || typeof diff !== 'string') {
      return res.status(400).json({ error: 'Missing diff' });
    }

    const fileList: Array<{ path: string; content: string }> = Array.isArray(files) ? files : [];
    const fileMap = new Map(fileList.map(f => [f.path, f.content]));

    const patches = parseUnifiedDiff(diff);
    const results: Array<{ path: string; status: 'applied' | 'created' | 'failed'; error?: string }> = [];
    const updatedFiles: Array<{ path: string; content: string }> = [];

    for (const patch of patches) {
      const oldPath = patch.oldFile.startsWith('a/') ? patch.oldFile.slice(2) : patch.oldFile;
      const newPath = patch.newFile.startsWith('b/') ? patch.newFile.slice(2) : patch.newFile;

      if (patch.oldFile === '/dev/null') {
        const content = buildContentFromNewFilePatch(patch);
        fileMap.set(newPath, content);
        results.push({ path: newPath, status: 'created' });
        updatedFiles.push({ path: newPath, content });
        continue;
      }

      if (patch.newFile === '/dev/null') {
        fileMap.delete(oldPath);
        results.push({ path: oldPath, status: 'applied' });
        continue;
      }

      const current = fileMap.get(oldPath) ?? '';
      const updated = applyPatchToContent(current, patch);
      if (updated === null) {
        results.push({ path: oldPath, status: 'failed', error: 'Patch failed to apply' });
        continue;
      }

      fileMap.set(newPath, updated);
      results.push({ path: newPath, status: 'applied' });
      updatedFiles.push({ path: newPath, content: updated });
    }

    return res.status(200).json({ success: true, results, updatedFiles });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}
