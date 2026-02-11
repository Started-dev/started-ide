import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnimatedDiffBlockProps {
  code: string;
  defaultCollapsed?: boolean;
}

export function AnimatedDiffBlock({ code, defaultCollapsed = false }: AnimatedDiffBlockProps) {
  const lines = code.split('\n');
  const isLong = lines.length > 20;
  const [collapsed, setCollapsed] = useState(defaultCollapsed || isLong);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.1 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const displayLines = collapsed ? lines.slice(0, 8) : lines;

  return (
    <div className="rounded-md border border-border/30 bg-[hsl(var(--chat-block-bg))] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/20">
        <span className="text-[10px] text-muted-foreground font-mono">diff</span>
        {isLong && (
          <button
            onClick={() => setCollapsed(prev => !prev)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            {collapsed ? <><ChevronDown className="h-3 w-3" /> View Full Diff</> : <><ChevronUp className="h-3 w-3" /> Collapse</>}
          </button>
        )}
      </div>
      <pre ref={ref} className="px-3 py-2 overflow-x-auto text-[11px] font-mono leading-relaxed">
        <code>
          {displayLines.map((line, i) => (
            <div
              key={i}
              className={cn(
                'transition-all duration-150',
                visible ? 'animate-diff-line' : 'opacity-0',
                line.startsWith('+') && !line.startsWith('+++') ? 'text-ide-success' :
                line.startsWith('-') && !line.startsWith('---') ? 'text-ide-error opacity-60 line-through' :
                line.startsWith('@@') ? 'text-ide-info' : 'text-muted-foreground'
              )}
              style={{ animationDelay: visible ? `${i * 30}ms` : '0ms' }}
            >
              {line}
            </div>
          ))}
          {collapsed && isLong && (
            <div className="text-muted-foreground/50 py-1">... {lines.length - 8} more lines</div>
          )}
        </code>
      </pre>
    </div>
  );
}
