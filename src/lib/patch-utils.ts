import { ParsedPatch, DiffHunk, DiffLine } from '@/types/tools';

// ─── Types ───

export interface FileBlock {
  path: string;
  content: string;
  language: string;
}

/**
 * Parse a unified diff string into structured patches.
 */
export function parseUnifiedDiff(raw: string): ParsedPatch[] {
  const patches: ParsedPatch[] = [];
  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    if (lines[i]?.startsWith('---')) {
      const oldFile = lines[i].replace(/^---\s+(a\/)?/, '').trim();
      i++;
      if (i >= lines.length || !lines[i]?.startsWith('+++')) {
        i++;
        continue;
      }
      const newFile = lines[i].replace(/^\+\+\+\s+(b\/)?/, '').trim();
      i++;

      const hunks: DiffHunk[] = [];

      while (i < lines.length && !lines[i]?.startsWith('---')) {
        if (lines[i]?.startsWith('@@')) {
          const hunkMatch = lines[i].match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
          if (hunkMatch) {
            const hunk: DiffHunk = {
              oldStart: parseInt(hunkMatch[1], 10),
              oldCount: parseInt(hunkMatch[2] ?? '1', 10),
              newStart: parseInt(hunkMatch[3], 10),
              newCount: parseInt(hunkMatch[4] ?? '1', 10),
              lines: [],
            };
            i++;

            while (i < lines.length && !lines[i]?.startsWith('@@') && !lines[i]?.startsWith('---')) {
              const line = lines[i];
              if (line.startsWith('+')) {
                hunk.lines.push({ type: 'add', content: line.slice(1) });
              } else if (line.startsWith('-')) {
                hunk.lines.push({ type: 'remove', content: line.slice(1) });
              } else if (line.startsWith(' ') || line === '') {
                hunk.lines.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line });
              } else {
                break;
              }
              i++;
            }

            hunks.push(hunk);
          } else {
            i++;
          }
        } else {
          i++;
        }
      }

      if (hunks.length > 0) {
        patches.push({ oldFile, newFile, hunks });
      }
    } else {
      i++;
    }
  }

  return patches;
}

/**
 * Apply a parsed patch to file content.
 * Returns the new content or null if the patch can't be applied.
 */
export function applyPatchToContent(content: string, patch: ParsedPatch): string | null {
  const lines = content.split('\n');
  const sortedHunks = [...patch.hunks].sort((a, b) => b.oldStart - a.oldStart);

  for (const hunk of sortedHunks) {
    const startIdx = hunk.oldStart - 1;
    const newLines: string[] = [];

    for (const line of hunk.lines) {
      if (line.type === 'add' || line.type === 'context') {
        newLines.push(line.content);
      }
    }

    lines.splice(startIdx, hunk.oldCount, ...newLines);
  }

  return lines.join('\n');
}

/**
 * Extract diff blocks from an AI response message.
 * Matches ```diff blocks AND code blocks with file-path headers.
 */
export function extractDiffFromMessage(message: string): string | null {
  // Try standard ```diff block first
  const diffMatch = message.match(/```diff\n([\s\S]*?)```/);
  if (diffMatch) return diffMatch[1].trim();

  // Try code blocks that contain unified diff markers (--- / +++ / @@)
  const codeBlocks = message.match(/```(?:\w+)?\n([\s\S]*?)```/g);
  if (codeBlocks) {
    for (const block of codeBlocks) {
      const inner = block.replace(/```(?:\w+)?\n/, '').replace(/```$/, '').trim();
      if (inner.includes('--- ') && inner.includes('+++ ') && inner.includes('@@ ')) {
        return inner;
      }
    }
  }

  return null;
}

/**
 * Extract file blocks from AI response — matches ```lang filepath\ncontent```
 * This handles AI responses that output full file contents with a path header.
 */
export function extractFileBlocksFromMessage(message: string): FileBlock[] {
  const blocks: FileBlock[] = [];
  // Match: ```language path/to/file.ext\ncontent\n```
  // The path must contain a / or a . to distinguish from just a language tag
  const regex = /```(\w+)\s+([\w./-]+(?:\/[\w./-]+|\.[\w]+))\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(message)) !== null) {
    const language = match[1];
    const path = match[2];
    const content = match[3].trimEnd();

    // Skip if this looks like a diff block
    if (content.includes('--- ') && content.includes('+++ ') && content.includes('@@ ')) {
      continue;
    }

    // Must have a file extension to be considered a file path
    if (!path.includes('.')) continue;

    blocks.push({ path, content, language });
  }

  return blocks;
}

/**
 * Extract suggested commands from an AI response message.
 */
export function extractCommandsFromMessage(message: string): string[] {
  const commandBlocks = message.match(/```(?:bash|sh|shell)?\n([\s\S]*?)```/g);
  if (!commandBlocks) return [];

  return commandBlocks
    .map(block => block.replace(/```(?:bash|sh|shell)?\n/, '').replace(/```$/, '').trim())
    .filter(cmd => {
      return !cmd.startsWith('---') && !cmd.startsWith('+++') && !cmd.startsWith('@@');
    });
}
