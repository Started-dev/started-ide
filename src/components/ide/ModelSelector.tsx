import { ChevronDown } from 'lucide-react';

export const AVAILABLE_MODELS = [
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', desc: 'Fast, default' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Heavy reasoning' },
  { id: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro', desc: 'Next-gen' },
  { id: 'openai/gpt-5', label: 'GPT-5', desc: 'Powerful all-rounder' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini', desc: 'Balanced' },
] as const;

export type ModelId = typeof AVAILABLE_MODELS[number]['id'];

interface ModelSelectorProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const current = AVAILABLE_MODELS.find(m => m.id === value) || AVAILABLE_MODELS[0];

  return (
    <div className="relative group">
      <button className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-sm bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
        <span className="font-medium">{current.label}</span>
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-50 bg-popover border border-border rounded-md shadow-lg min-w-[180px]">
        {AVAILABLE_MODELS.map(m => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-accent transition-colors first:rounded-t-md last:rounded-b-md ${
              m.id === value ? 'bg-primary/10 text-primary' : 'text-foreground'
            }`}
          >
            <span className="font-medium">{m.label}</span>
            <span className="ml-1.5 text-muted-foreground">— {m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
