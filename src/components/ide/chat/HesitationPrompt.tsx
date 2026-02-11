import { X } from 'lucide-react';

interface HesitationPromptProps {
  message: string;
  onAccept: () => void;
  onDismiss: () => void;
}

export function HesitationPrompt({ message, onAccept, onDismiss }: HesitationPromptProps) {
  return (
    <div className="mx-3 mb-1.5 flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-md border border-border/30 bg-muted/20 animate-fade-in">
      <button
        onClick={onAccept}
        className="text-foreground/80 hover:text-primary transition-colors duration-150 text-left"
      >
        {message}
      </button>
      <button
        onClick={onDismiss}
        className="p-0.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors duration-150 shrink-0"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
