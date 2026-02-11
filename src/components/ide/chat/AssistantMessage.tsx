import React from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { AnimatedDiffBlock } from './AnimatedDiffBlock';
import { CommandBlock } from './CommandBlock';
import { ConfidenceFooter } from './ConfidenceFooter';
import { RewindReasoning } from './RewindReasoning';
import type { ChatMessage } from '@/types/ide';

interface AssistantMessageProps {
  msg: ChatMessage;
}

interface ParsedBlock {
  type: 'plan' | 'diff' | 'command' | 'verification' | 'code' | 'text';
  content: string;
  lang?: string;
}

function parseBlocks(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const parts = content.split(/(```[\s\S]*?```)/g);

  for (const part of parts) {
    if (part.startsWith('```') && part.endsWith('```')) {
      const lines = part.split('\n');
      const lang = lines[0].replace('```', '').trim();
      const code = lines.slice(1, -1).join('\n');

      if (lang === 'diff') {
        blocks.push({ type: 'diff', content: code });
      } else if (['bash', 'sh', 'shell'].includes(lang)) {
        blocks.push({ type: 'command', content: code });
      } else {
        blocks.push({ type: 'code', content: code, lang });
      }
    } else if (part.trim()) {
      // Check for plan headers
      const planMatch = part.match(/^(Plan:|##?\s*Plan)/m);
      const verificationMatch = part.match(/^(Verification:|Status:)/m);

      if (planMatch) {
        blocks.push({ type: 'plan', content: part.trim() });
      } else if (verificationMatch) {
        blocks.push({ type: 'verification', content: part.trim() });
      } else {
        blocks.push({ type: 'text', content: part.trim() });
      }
    }
  }
  return blocks;
}

function extractConfidence(content: string): 'high' | 'medium' | 'low' | undefined {
  const match = content.match(/Confidence:\s*(high|medium|low)/i);
  return match ? (match[1].toLowerCase() as 'high' | 'medium' | 'low') : undefined;
}

function extractAttestation(content: string): string | undefined {
  const match = content.match(/Attestation:\s*(0x[a-f0-9]+)/i);
  return match ? match[1] : undefined;
}

export function AssistantMessage({ msg }: AssistantMessageProps) {
  const blocks = parseBlocks(msg.content);
  const confidence = extractConfidence(msg.content);
  const attestation = extractAttestation(msg.content);

  return (
    <div className="animate-fade-in space-y-3">
      {blocks.map((block, i) => (
        <React.Fragment key={i}>
          {block.type === 'plan' && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/80 hover:text-foreground transition-colors duration-150 w-full">
                <ChevronDown className="h-3 w-3 transition-transform data-[state=closed]:rotate-[-90deg]" />
                Plan
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1.5">
                <div className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed font-mono pl-4 border-l-2 border-border/40">
                  {renderInlineFormatting(block.content)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {block.type === 'diff' && (
            <AnimatedDiffBlock code={block.content} />
          )}

          {block.type === 'command' && (
            <CommandBlock commands={block.content.split('\n').filter(l => l.trim())} />
          )}

          {block.type === 'verification' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/30 bg-[hsl(var(--chat-block-bg))] text-[11px]">
              <VerificationBadge content={block.content} />
            </div>
          )}

          {block.type === 'code' && (
            <pre className="px-3 py-2 rounded-md bg-[hsl(var(--chat-block-bg))] border border-border/20 overflow-x-auto text-[11px] font-mono">
              {block.lang && <div className="text-[10px] text-muted-foreground/60 mb-1">{block.lang}</div>}
              <code>{block.content}</code>
            </pre>
          )}

          {block.type === 'text' && (
            <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-mono">
              {renderInlineFormatting(block.content)}
            </div>
          )}

          {i < blocks.length - 1 && <div className="border-b border-border/20" />}
        </React.Fragment>
      ))}

      <RewindReasoning reasoning={msg.reasoning} />
    </div>
  );
}

function renderInlineFormatting(text: string): React.ReactNode {
  return text.split(/(\*\*.*?\*\*)/g).map((seg, j) => {
    if (seg.startsWith('**') && seg.endsWith('**')) {
      return <strong key={j} className="text-foreground font-semibold">{seg.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={j}>{seg}</React.Fragment>;
  });
}

function VerificationBadge({ content }: { content: string }) {
  const passed = /pass/i.test(content);
  const failed = /fail/i.test(content);

  return (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${passed ? 'bg-ide-success' : failed ? 'bg-ide-error' : 'bg-muted-foreground'}`} />
      <span className={`${passed ? 'text-ide-success' : failed ? 'text-ide-error' : 'text-muted-foreground'}`}>
        {passed ? 'Passed' : failed ? 'Failed' : 'Unverified'}
      </span>
    </>
  );
}
