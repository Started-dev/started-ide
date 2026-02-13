interface DiffLine {
  type: 'add' | 'remove' | 'context';
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
          const match = lines[i].match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
          if (!match) {
            i++;
            continue;
          }

          const hunk: DiffHunk = {
            oldStart: parseInt(match[1], 10),
            oldCount: parseInt(match[2] ?? '1', 10),
            newStart: parseInt(match[3], 10),
            newCount: parseInt(match[4] ?? '1', 10),
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

export function buildContentFromNewFilePatch(patch: ParsedPatch): string {
  const content: string[] = [];
  for (const hunk of patch.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add' || line.type === 'context') {
        content.push(line.content);
      }
    }
  }
  return content.join('\n');
}
