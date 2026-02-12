import { useState, useMemo } from 'react';
import { Search, ExternalLink, Plus, Check, X, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SKILLS_CATALOG, SKILL_CATEGORIES, type Skill, type SkillCategory } from '@/data/skills-catalog';

interface SkillsBrowserProps {
  onClose: () => void;
  activeSkills: string[];
  onToggleSkill: (skillId: string) => void;
}

const tierColors: Record<string, string> = {
  official: 'bg-primary/15 text-primary border-primary/30',
  community: 'bg-accent text-accent-foreground border-border',
  marketplace: 'bg-ide-warning/15 text-ide-warning border-ide-warning/30',
};

const sourceLabels: Record<string, string> = {
  'awesome-agent-skills': 'Awesome',
  'skillsmp': 'SkillsMP',
  'clawhub': 'ClawHub',
};

export function SkillsBrowser({ onClose, activeSkills, onToggleSkill }: SkillsBrowserProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<SkillCategory | 'all'>('all');

  const filtered = useMemo(() => {
    let results = SKILLS_CATALOG;
    if (activeCategory !== 'all') {
      results = results.filter(s => s.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.includes(q)) ||
        s.author.toLowerCase().includes(q)
      );
    }
    return results;
  }, [search, activeCategory]);

  const activeCount = activeSkills.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-xl flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Skills Browser</h2>
            {activeCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">{activeCount} active</Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search skills..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Category chips */}
        <div className="px-4 pb-2 flex flex-wrap gap-1 shrink-0">
          <button
            onClick={() => setActiveCategory('all')}
            className={`text-[10px] px-2 py-1 rounded-sm transition-colors ${
              activeCategory === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            All ({SKILLS_CATALOG.length})
          </button>
          {SKILL_CATEGORIES.map(cat => {
            const count = SKILLS_CATALOG.filter(s => s.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-[10px] px-2 py-1 rounded-sm transition-colors ${
                  activeCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Skills list — native scroll */}
        <div className="overflow-y-auto flex-1 min-h-0 px-4 pb-3">
          <div className="space-y-2">
            {filtered.map(skill => (
              <SkillCard
                key={skill.id}
                skill={skill}
                isActive={activeSkills.includes(skill.id)}
                onToggle={() => onToggleSkill(skill.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No skills match your search.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground shrink-0">
          {filtered.length} skill{filtered.length !== 1 ? 's' : ''} shown · {activeCount} active
        </div>
      </div>
    </div>
  );
}

function SkillCard({ skill, isActive, onToggle }: { skill: Skill; isActive: boolean; onToggle: () => void }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
      isActive ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:bg-accent/30'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-foreground truncate">{skill.name}</span>
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${tierColors[skill.tier]}`}>
            {skill.tier}
          </Badge>
          <span className="text-[9px] text-muted-foreground">{sourceLabels[skill.source]}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{skill.description}</p>
        <div className="flex items-center gap-1 mt-1.5">
          <span className="text-[9px] text-muted-foreground/70">{skill.author}</span>
          <span className="text-[9px] text-muted-foreground/40">·</span>
          {skill.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-muted rounded-sm text-muted-foreground">{tag}</span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <a href={skill.url} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <Button
          variant={isActive ? 'default' : 'outline'}
          size="icon"
          className="h-7 w-7"
          onClick={onToggle}
        >
          {isActive ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}
