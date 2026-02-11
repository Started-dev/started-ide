import * as React from "react";
import { useState } from "react";

type HeroProps = {
  title?: string;
  subtitle?: string;
  ctaPrimaryLabel?: string;
  onCtaPrimary?: () => void;
  ctaSecondaryLabel?: string;
  ctaSecondaryHref?: string;
  badgeText?: string;
};

export default function Hero({
  title = "Ship production software\nwith AI agents.",
  subtitle = "Plan, generate, verify, and deploy real applications — inside a live AI-native development environment.",
  ctaPrimaryLabel = "Get Started",
  onCtaPrimary,
  ctaSecondaryLabel = "View Documentation",
  ctaSecondaryHref = "https://docs.started.dev",
  badgeText = "Now in Public Beta",
}: HeroProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <section
      className="relative w-full min-h-[calc(100vh-72px)] flex items-center justify-center overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <HeroBackground mouseX={mousePos.x} mouseY={mousePos.y} />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-3xl mx-auto gap-6">
        {/* Micro-labels */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 text-xs font-medium text-primary tracking-wide">
            {badgeText}
          </span>
          <span className="hidden sm:inline-flex items-center rounded-full border border-border/40 bg-muted/30 px-3 py-1 text-[11px] font-mono text-muted-foreground/60 tracking-wider">
            Deterministic build runtime
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
          {renderTitleWithAccent(title)}
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
          {subtitle}
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <button
            onClick={onCtaPrimary}
            className="h-11 px-7 text-sm font-medium rounded-lg bg-primary text-primary-foreground shadow-[0_0_20px_hsl(38_92%_50%/0.15)] hover:shadow-[0_0_30px_hsl(38_92%_50%/0.25)] hover:bg-primary/90 transition-all duration-300 hover:scale-[1.02] inline-flex items-center gap-2"
          >
            {ctaPrimaryLabel}
            <span className="ml-1">→</span>
          </button>
          <a
            href={ctaSecondaryHref}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 px-7 text-sm font-medium rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-300 inline-flex items-center"
          >
            {ctaSecondaryLabel}
          </a>
        </div>

        <p className="text-xs text-muted-foreground/50 mt-1 tracking-wide">
          No setup required&ensp;•&ensp;Runs in your browser
        </p>
      </div>
    </section>
  );
}

function renderTitleWithAccent(title: string) {
  const lines = title.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const parts = splitKeep(line, "AI agents");
        return (
          <React.Fragment key={i}>
            {parts.map((p, idx) =>
              p === "AI agents" ? (
                <span key={idx} className="text-primary">
                  {p}
                </span>
              ) : (
                <span key={idx}>{p}</span>
              )
            )}
            {i < lines.length - 1 ? <br /> : null}
          </React.Fragment>
        );
      })}
    </>
  );
}

function splitKeep(input: string, token: string) {
  if (!input.includes(token)) return [input];
  const out: string[] = [];
  let rest = input;
  while (rest.includes(token)) {
    const idx = rest.indexOf(token);
    if (idx > 0) out.push(rest.slice(0, idx));
    out.push(token);
    rest = rest.slice(idx + token.length);
  }
  if (rest) out.push(rest);
  return out;
}

function HeroBackground({ mouseX, mouseY }: { mouseX: number; mouseY: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base background */}
      <div className="absolute inset-0 bg-background" />

      {/* Toned-down vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 45%, hsl(38 92% 50% / 0.03) 0%, transparent 60%)",
        }}
      />

      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Mouse-following glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(400px circle at ${mouseX}px ${mouseY}px, hsl(38 92% 50% / 0.03), transparent 80%)`,
          transition: "background 0.6s cubic-bezier(0.25, 0.1, 0.25, 1)",
        }}
      />

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32"
        style={{
          background: "linear-gradient(to top, hsl(var(--background)), transparent)",
        }}
      />
    </div>
  );
}
