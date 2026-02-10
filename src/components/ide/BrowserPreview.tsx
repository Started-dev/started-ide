import { useState, useCallback, useEffect } from 'react';
import { Globe, X, ExternalLink, RefreshCw } from 'lucide-react';

interface BrowserPreviewProps {
  url: string;
  onClose: () => void;
}

export function BrowserPreview({ url, onClose }: BrowserPreviewProps) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [key, setKey] = useState(0);

  useEffect(() => {
    setCurrentUrl(url);
  }, [url]);

  const refresh = useCallback(() => {
    setKey(k => k + 1);
  }, []);

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Browser bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
        <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="flex-1 flex items-center gap-1 bg-background rounded-sm px-2 py-1 min-w-0">
          <input
            value={currentUrl}
            onChange={e => setCurrentUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setKey(k => k + 1); }}
            className="flex-1 bg-transparent text-xs font-mono text-foreground outline-none truncate"
            placeholder="Enter URL..."
          />
        </div>
        <button
          onClick={refresh}
          className="p-1 text-muted-foreground hover:text-foreground rounded-sm hover:bg-accent/30 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-muted-foreground hover:text-foreground rounded-sm hover:bg-accent/30 transition-colors"
          title="Open in new tab"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground rounded-sm hover:bg-accent/30 transition-colors"
          title="Close preview"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {/* Iframe */}
      <div className="flex-1 bg-white">
        <iframe
          key={key}
          src={currentUrl}
          className="w-full h-full border-none"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          title="Browser Preview"
        />
      </div>
    </div>
  );
}

// Utility: detect server URLs from terminal output
export function detectServerUrl(text: string): string | null {
  const patterns = [
    /https?:\/\/localhost:\d+/,
    /https?:\/\/127\.0\.0\.1:\d+/,
    /https?:\/\/0\.0\.0\.0:\d+/,
    /Local:\s+(https?:\/\/[^\s]+)/,
    /listening (?:on|at)\s+(https?:\/\/[^\s]+)/i,
    /server (?:running|started)\s+(?:on|at)\s+(https?:\/\/[^\s]+)/i,
    /ready (?:on|at)\s+(https?:\/\/[^\s]+)/i,
    /➜\s+Local:\s+(https?:\/\/[^\s]+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  return null;
}
