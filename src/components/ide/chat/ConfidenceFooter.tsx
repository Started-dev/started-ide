import { useIDE } from '@/contexts/IDEContext';
import { cn } from '@/lib/utils';

interface ConfidenceFooterProps {
  confidence?: 'high' | 'medium' | 'low';
  verified?: boolean;
  attestationHash?: string;
}

export function ConfidenceFooter({ confidence = 'medium', verified, attestationHash }: ConfidenceFooterProps) {
  const { runCommand } = useIDE();

  const confidenceColor = confidence === 'high'
    ? 'text-ide-success'
    : confidence === 'medium'
    ? 'text-ide-warning'
    : 'text-muted-foreground';

  return (
    <div className="flex items-center justify-end gap-3 mt-2 text-[10px] text-muted-foreground/70">
      <span className={cn('capitalize', confidenceColor)}>
        Confidence: {confidence}
      </span>
      <span>
        Verified: {verified ? 'Yes' : 'No'}
      </span>
      {attestationHash && (
        <button
          className="font-mono hover:text-primary transition-colors duration-150"
          onClick={() => {/* link to attestation replay */}}
          title="View attestation"
        >
          {attestationHash.slice(0, 10)}…
        </button>
      )}
      {!verified && (
        <button
          onClick={() => runCommand('npm test')}
          className="text-primary hover:text-primary/80 transition-colors duration-150"
        >
          Run tests?
        </button>
      )}
    </div>
  );
}
