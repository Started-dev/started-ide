import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { supabase } from '@/integrations/supabase/client';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sun, Moon, Monitor, Type, Bot } from 'lucide-react';

interface AgentPreset {
  key: string;
  name: string;
  description: string | null;
}

export function PreferencesTab() {
  const { theme, setTheme } = useTheme();
  const [fontSize, setFontSize] = useState(() => {
    return Number(localStorage.getItem('editor_font_size') ?? '14');
  });
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [defaultPreset, setDefaultPreset] = useState(() => {
    return localStorage.getItem('default_agent_preset') ?? '';
  });

  useEffect(() => {
    supabase.from('agent_presets').select('key, name, description').then(({ data }) => {
      if (data) setPresets(data);
    });
  }, []);

  const handleFontSizeChange = (value: number[]) => {
    const v = value[0];
    setFontSize(v);
    localStorage.setItem('editor_font_size', String(v));
    // Dispatch custom event so EditorPane updates in the same window
    window.dispatchEvent(new CustomEvent('editor_font_size_change', { detail: v }));
  };

  const handlePresetChange = (value: string) => {
    setDefaultPreset(value);
    localStorage.setItem('default_agent_preset', value);
  };

  const themeOptions = [
    { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
    { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-1">Preferences</h2>
        <p className="text-sm text-muted-foreground">Customize your IDE experience.</p>
      </div>

      {/* Theme */}
      <div className="space-y-3">
        <label className="text-sm font-medium flex items-center gap-2">
          <Sun className="h-4 w-4 text-muted-foreground" />
          Theme
        </label>
        <div className="flex gap-2">
          {themeOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm border transition-colors ${
                theme === opt.value
                  ? 'border-primary bg-primary/10 text-foreground font-medium'
                  : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/30'
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Editor Font Size */}
      <div className="space-y-3">
        <label className="text-sm font-medium flex items-center gap-2">
          <Type className="h-4 w-4 text-muted-foreground" />
          Editor Font Size
        </label>
        <div className="flex items-center gap-4 max-w-sm">
          <Slider
            value={[fontSize]}
            onValueChange={handleFontSizeChange}
            min={14}
            max={22}
            step={1}
            className="flex-1"
          />
          <span className="text-sm font-mono w-10 text-right">{fontSize}px</span>
        </div>
      </div>

      {/* Default Agent Preset */}
      {presets.length > 0 && (
        <div className="space-y-3">
          <label className="text-sm font-medium flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            Default Agent Preset
          </label>
          <Select value={defaultPreset} onValueChange={handlePresetChange}>
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Select a preset" />
            </SelectTrigger>
            <SelectContent>
              {presets.map(p => (
                <SelectItem key={p.key} value={p.key}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {defaultPreset && presets.find(p => p.key === defaultPreset)?.description && (
            <p className="text-xs text-muted-foreground">
              {presets.find(p => p.key === defaultPreset)?.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
