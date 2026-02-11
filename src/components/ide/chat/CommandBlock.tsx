import { Terminal } from 'lucide-react';
import { useIDE } from '@/contexts/IDEContext';

interface CommandBlockProps {
  commands: string[];
}

export function CommandBlock({ commands }: CommandBlockProps) {
  const { runCommand } = useIDE();

  return (
    <div className="space-y-1">
      {commands.map((cmd, i) => (
        <button
          key={i}
          onClick={() => runCommand(cmd)}
          className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-[11px] font-mono rounded-md border border-border/40 bg-[hsl(var(--chat-block-bg))] hover:bg-muted/60 hover:border-border/60 transition-all duration-150 group"
        >
          <Terminal className="h-3 w-3 text-muted-foreground group-hover:text-primary shrink-0 transition-colors duration-150" />
          <span className="text-foreground truncate">{cmd}</span>
          <span className="ml-auto text-[9px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">click to run</span>
        </button>
      ))}
    </div>
  );
}
