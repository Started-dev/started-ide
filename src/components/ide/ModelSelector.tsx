import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export const AVAILABLE_MODELS = [
  { id: 'started/started-ai', label: 'StartedAI', desc: 'Token-efficient default', provider: 'started' },
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', desc: 'Fast & capable', provider: 'google' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Heavy reasoning', provider: 'google' },
  { id: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro', desc: 'Next-gen', provider: 'google' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Balanced', provider: 'google' },
  { id: 'openai/gpt-5', label: 'GPT-5', desc: 'Powerful all-rounder', provider: 'openai' },
  { id: 'openai/gpt-5.2', label: 'GPT-5.2', desc: 'Latest OpenAI', provider: 'openai' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini', desc: 'Balanced', provider: 'openai' },
  { id: 'openai/gpt-5-nano', label: 'GPT-5 Nano', desc: 'Speed-optimized', provider: 'openai' },
  { id: 'anthropic/claude-sonnet-4', label: 'Claude 4 Sonnet', desc: 'Fast & smart', provider: 'anthropic' },
  { id: 'anthropic/claude-opus-4', label: 'Claude 4 Opus', desc: 'Deep reasoning', provider: 'anthropic' },
  { id: 'anthropic/claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', desc: 'Speed-optimized', provider: 'anthropic' },
] as const;

export type ModelId = typeof AVAILABLE_MODELS[number]['id'];

const PROVIDER_COLORS: Record<string, string> = {
  started: 'bg-primary/15 text-primary',
  google: 'bg-blue-500/15 text-blue-400',
  openai: 'bg-green-500/15 text-green-400',
  anthropic: 'bg-amber-500/15 text-amber-400',
};

interface ModelSelectorProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const current = AVAILABLE_MODELS.find(m => m.id === value) || AVAILABLE_MODELS[0];
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        <div className="absolute bottom-full left-0 mb-0 z-50 bg-popover border border-border rounded-md shadow-lg min-w-[240px] py-1">
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
              <span className={`ml-1.5 text-[9px] px-1 py-0.5 rounded-sm ${PROVIDER_COLORS[m.provider] || ''}`}>{m.provider}</span>
              <span className="ml-1 text-muted-foreground">— {m.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
