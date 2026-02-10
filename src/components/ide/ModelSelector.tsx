import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export const AVAILABLE_MODELS = [
  { id: 'started/started-ai', label: 'StartedAI', desc: 'Optimal all-around default' },
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', desc: 'Fast & capable' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Heavy reasoning' },
  { id: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro', desc: 'Next-gen' },
  { id: 'openai/gpt-5', label: 'GPT-5', desc: 'Powerful all-rounder' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini', desc: 'Balanced' },
  { id: 'anthropic/claude-4-opus', label: 'Claude 4 Opus', desc: 'Deep reasoning' },
  { id: 'anthropic/claude-4.5-opus', label: 'Claude 4.5 Opus', desc: 'Advanced reasoning' },
  { id: 'anthropic/claude-4.6-opus', label: 'Claude 4.6 Opus', desc: 'Latest & strongest' },
  { id: 'anthropic/claude-4-sonnet', label: 'Claude 4 Sonnet', desc: 'Fast & smart' },
  { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku', desc: 'Speed-optimized' },
] as const;

export type ModelId = typeof AVAILABLE_MODELS[number]['id'];

interface ModelSelectorProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const current = AVAILABLE_MODELS.find(m => m.id === value) || AVAILABLE_MODELS[0];
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-sm bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <span className="font-medium">{current.label}</span>
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-0 z-50 bg-popover border border-border rounded-md shadow-lg min-w-[200px] py-1">
          {AVAILABLE_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-accent transition-colors ${
                m.id === value ? 'bg-primary/10 text-primary' : 'text-foreground'
              }`}
            >
              <span className="font-medium">{m.label}</span>
              {m.id === 'started/started-ai' && <span className="ml-1 text-[9px] px-1 py-0.5 bg-primary/15 text-primary rounded-sm font-semibold">default</span>}
              <span className="ml-1.5 text-muted-foreground">— {m.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
