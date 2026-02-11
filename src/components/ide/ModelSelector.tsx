import { ChevronDown } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useState } from 'react';

export const AVAILABLE_MODELS = [
  { id: 'started/started-ai', label: 'StartedAI', multiplier: 0.5, provider: 'started' },
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', multiplier: 1, provider: 'google' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', multiplier: 2, provider: 'google' },
  { id: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro', multiplier: 2, provider: 'google' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', multiplier: 1, provider: 'google' },
  { id: 'openai/gpt-5', label: 'GPT-5', multiplier: 3, provider: 'openai' },
  { id: 'openai/gpt-5.2', label: 'GPT-5.2', multiplier: 3.5, provider: 'openai' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini', multiplier: 1.5, provider: 'openai' },
  { id: 'openai/gpt-5-nano', label: 'GPT-5 Nano', multiplier: 0.75, provider: 'openai' },
  { id: 'anthropic/claude-sonnet-4', label: 'Claude 4 Sonnet', multiplier: 4, provider: 'anthropic' },
  { id: 'anthropic/claude-opus-4', label: 'Claude 4 Opus', multiplier: 6, provider: 'anthropic' },
  { id: 'anthropic/claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', multiplier: 2, provider: 'anthropic' },
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-sm bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <span className="font-medium">{current.label}</span>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={4}
        className="min-w-[260px] max-h-[280px] overflow-y-auto p-1"
      >
        {AVAILABLE_MODELS.map(m => (
          <button
            key={m.id}
            onClick={() => { onChange(m.id); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-accent transition-colors flex items-center gap-1.5 rounded-sm ${
              m.id === value ? 'bg-primary/10 text-primary' : 'text-foreground'
            }`}
          >
            <span className="font-medium shrink-0">{m.label}</span>
            {m.id === 'started/started-ai' && <span className="text-[9px] px-1 py-0.5 bg-primary/15 text-primary rounded-sm font-semibold shrink-0">default</span>}
            <span className={`text-[9px] px-1 py-0.5 rounded-sm shrink-0 ${PROVIDER_COLORS[m.provider] || ''}`}>{m.provider}</span>
            <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground font-mono font-semibold shrink-0">{m.multiplier}×</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
