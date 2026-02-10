import { ParsedPatch, DiffHunk, DiffLine } from '@/types/tools';

/**
 * Parse a unified diff string into structured patches.
 */
export function parseUnifiedDiff(raw: string): ParsedPatch[] {
  const patches: ParsedPatch[] = [];
  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Look for --- line
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

      // Parse hunks
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

            // Collect hunk lines
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

  // Apply hunks in reverse order to preserve line numbers
  const sortedHunks = [...patch.hunks].sort((a, b) => b.oldStart - a.oldStart);

  for (const hunk of sortedHunks) {
    const startIdx = hunk.oldStart - 1; // Convert to 0-indexed
    const newLines: string[] = [];

    for (const line of hunk.lines) {
      if (line.type === 'add' || line.type === 'context') {
        newLines.push(line.content);
      }
    }

    // Replace the old lines with new lines
    lines.splice(startIdx, hunk.oldCount, ...newLines);
  }

  return lines.join('\n');
}

/**
 * Extract diff blocks from an AI response message.
 */
export function extractDiffFromMessage(message: string): string | null {
  const diffMatch = message.match(/```diff\n([\s\S]*?)```/);
  return diffMatch ? diffMatch[1].trim() : null;
}

/**
 * Extract suggested commands from an AI response message.
 */
export function extractCommandsFromMessage(message: string): string[] {
  // Match fenced code blocks after "Commands:" or standalone blocks that look like commands
  const commandBlocks = message.match(/```(?:bash|sh|shell)?\n([\s\S]*?)```/g);
  if (!commandBlocks) return [];

  return commandBlocks
    .map(block => block.replace(/```(?:bash|sh|shell)?\n/, '').replace(/```$/, '').trim())
    .filter(cmd => {
      // Filter out diff blocks
      return !cmd.startsWith('---') && !cmd.startsWith('+++') && !cmd.startsWith('@@');
    });
}
